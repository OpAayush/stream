import { configWrite, configRead } from "./config.js";
import { enablePip } from "./features/pictureInPicture.js";
import modernUI, { optionShow } from "./ui/settings.js";
import { speedSettings } from "./ui/speedUI.js";
import { showToast, buttonItem } from "./ui/ytUI.js";

// --- Caching ---
let _resolveCommandInstance = null;
const _functionCache = new Map();

/**
 * Finds and caches the core YouTube TV instance that contains resolveCommand.
 * @returns {object | null} The instance, or null if not found.
 */
function getResolveCommandInstance() {
  if (_resolveCommandInstance) {
    return _resolveCommandInstance;
  }

  for (const key in window._yttv) {
    const yttv = window._yttv[key];
    if (yttv?.instance?.resolveCommand) {
      _resolveCommandInstance = yttv.instance;
      return _resolveCommandInstance;
    }
  }
  return null;
}

/**
 * A proxy function to call the original resolveCommand.
 * Used by other modules in this mod.
 */
export default function resolveCommand(cmd, _) {
  const instance = getResolveCommandInstance();
  if (instance) {
    return instance.resolveCommand(cmd, _);
  }
  console.warn("TizenTube: resolveCommand instance not found!");
}

/**
 * Finds any top-level function in any _yttv object and caches the result.
 * @param {string} funcName - The name of the function to find.
 * @returns {Function | undefined}
 */
export function findFunction(funcName) {
  if (_functionCache.has(funcName)) {
    return _functionCache.get(funcName);
  }

  for (const key in window._yttv) {
    const yttv = window._yttv[key];
    if (yttv && typeof yttv[funcName] === "function") {
      const func = yttv[funcName];
      _functionCache.set(funcName, func);
      return func;
    }
  }
  return undefined;
}

/**
 * Patches the original resolveCommand to intercept commands and add custom logic.
 * This function is idempotent (safe to call multiple times).
 */
export function patchResolveCommand() {
  const instance = getResolveCommandInstance();

  if (!instance) {
    console.error(
      "TizenTube: Could not find resolveCommand instance to patch."
    );
    return;
  }

  if (instance.resolveCommand.isPatchedByTizenTube) {
    return; // Already patched
  }

  const ogResolve = instance.resolveCommand;

  instance.resolveCommand = function (cmd, _) {
    // 1. Handle Custom Actions
    // (Consolidates three separate 'if' blocks into one)
    const customActionData =
      cmd.customAction ||
      cmd?.signalAction?.customAction ||
      cmd?.showEngagementPanelEndpoint?.customAction;

    if (customActionData) {
      customAction(customActionData.action, customActionData.parameters);
      return true; // Stop processing
    }

    // 2. Handle Client Settings (TizenTube config)
    if (cmd.setClientSettingEndpoint) {
      // **BUG FIX**: Changed from buggy nested loop to a single, correct loop
      for (const setting of cmd.setClientSettingEndpoint.settingDatas) {
        const key = setting.clientSettingEnum.item;

        if (key === "I18N_LANGUAGE") {
          // Handle language change
          const lang = setting.stringValue;
          const date = new Date();
          date.setFullYear(date.getFullYear() + 10);
          document.cookie = `PREF=hl=${lang}; expires=${date.toUTCString()};`;
          // Reload to apply new language
          ogResolve.call(this, { signalAction: { signal: "RELOAD_PAGE" } }, _);
          return true; // Stop processing
        }

        if (!key.includes("_")) {
          // This is a TizenTube setting
          const valName = Object.keys(setting).find((k) => k.includes("Value"));
          if (!valName) continue;

          const value =
            valName === "intValue"
              ? Number(setting[valName])
              : setting[valName];

          if (valName === "arrayValue") {
            const arr = configRead(key) || [];
            if (arr.includes(value)) {
              arr.splice(arr.indexOf(value), 1);
            } else {
              arr.push(value);
            }
            configWrite(key, arr);
          } else {
            configWrite(key, value);
          }
        }
      }
      // We still call ogResolve for settings to let YouTube handle its own
    }

    // 3. Patch Playback Settings Popup
    if (cmd?.openPopupAction?.uniqueId === "playback-settings") {
      try {
        const items =
          cmd.openPopupAction.popup.overlaySectionRenderer.overlay
            .overlayTwoPanelRenderer.actionPanel.overlayPanelRenderer.content
            .overlayPanelItemListRenderer.items;

        for (const item of items) {
          if (
            item?.compactLinkRenderer?.icon?.iconType === "SLOW_MOTION_VIDEO"
          ) {
            // Hijack the 'Speed' button
            item.compactLinkRenderer.subtitle &&
              (item.compactLinkRenderer.subtitle.simpleText = "with TizenTube");
            item.compactLinkRenderer.serviceEndpoint = {
              clickTrackingParams: "null",
              signalAction: {
                customAction: { action: "TT_SPEED_SETTINGS_SHOW" },
              },
            };
          }
        }

        // Add "Picture in Picture" button
        items.splice(
          2,
          0,
          buttonItem(
            { title: "Picture in Picture" },
            { icon: "CLEAR_COOKIES" }, // Using a placeholder icon
            [{ customAction: { action: "ENTER_PIP" } }]
          )
        );
      } catch (e) {
        console.error("TizenTube: Failed to patch playback settings popup:", e);
      }
    }

    // 4. Handle exit from PiP (when a new video is watched)
    if (cmd?.watchEndpoint?.videoId) {
      window.isPipPlaying = false;
      const ytlrPlayerContainer = document.querySelector(
        "ytlr-player-container"
      );
      if (ytlrPlayerContainer) {
        ytlrPlayerContainer.style.removeProperty("z-index");
      }
    }

    // 5. Call the original function
    return ogResolve.call(this, cmd, _);
  };

  instance.resolveCommand.isPatchedByTizenTube = true;
  console.log("TizenTube: resolveCommand patched successfully.");
}

/**
 * Handles all custom actions defined by this mod.
 * @param {string} action - The action name.
 * @param {*} parameters - The data passed with the action.
 */
function customAction(action, parameters) {
  const video = document.querySelector("video");

  switch (action) {
    case "SETTINGS_UPDATE":
      modernUI(true, parameters);
      break;
    case "OPTIONS_SHOW":
      optionShow(parameters, parameters.update);
      break;
    case "SKIP":
      // Dispatch key event to close the SponsorBlock skip-button UI
      const kE = new Event("keydown", { bubbles: true, cancelable: true });
      kE.keyCode = 27; // Escape
      kE.which = 27;
      document.dispatchEvent(kE);

      if (video) {
        video.currentTime = parameters.time;
      }
      break;
    case "TT_SETTINGS_SHOW":
      modernUI();
      break;
    case "TT_SPEED_SETTINGS_SHOW":
      speedSettings();
      break;
    case "UPDATE_REMIND_LATER":
      configWrite("dontCheckUpdateUntil", parameters);
      break;
    case "UPDATE_DOWNLOAD":
      if (window.h5vcc?.tizentube) {
        window.h5vcc.tizentube.InstallAppFromURL(parameters);
        showToast("TizenTube Update", "Downloading update, please wait...");
      } else {
        showToast("TizenTube Error", "Update feature is not available.");
      }
      break;
    case "SET_PLAYER_SPEED":
      if (video) {
        video.playbackRate = Number(parameters);
      }
      break;
    case "ENTER_PIP":
      enablePip();
      break;
  }
}

// TizenTube Subtitle Localization Mod
// Automatically adds user's local language to subtitle auto-translate menu if not present

import { configRead } from "../config.js";

const LANGUAGE_CODES = [
  "af",
  "sq",
  "am",
  "ar",
  "hy",
  "as",
  "az",
  "eu",
  "be",
  "bn",
  "bs",
  "bg",
  "my",
  "ca",
  "zh-CN",
  "zh-TW",
  "zh-HK",
  "hr",
  "cs",
  "da",
  "nl",
  "en",
  "et",
  "fil",
  "fi",
  "fr",
  "gl",
  "ka",
  "de",
  "el",
  "gu",
  "he",
  "hi",
  "hu",
  "is",
  "id",
  "ga",
  "it",
  "ja",
  "kn",
  "kk",
  "km",
  "ko",
  "ky",
  "lo",
  "lv",
  "lt",
  "mk",
  "ms",
  "ml",
  "mt",
  "mr",
  "mn",
  "ne",
  "no",
  "or",
  "fa",
  "pl",
  "pt",
  "pa",
  "ro",
  "ru",
  "sr",
  "si",
  "sk",
  "sl",
  "es",
  "sw",
  "sv",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "ur",
  "uz",
  "vi",
  "cy",
  "yi",
  "yo",
  "zu",
];

// Return an object mapping language code -> localized language name.
export function getComprehensiveLanguageList(locale = "en") {
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: "language" });
    const map = {};
    LANGUAGE_CODES.forEach((code) => {
      const name = displayNames.of(code) || code;
      map[code] = name;
    });
    return map;
  } catch (e) {
    // Fallback if Intl.DisplayNames fails
    const fallback = {};
    LANGUAGE_CODES.forEach((c) => (fallback[c] = c));
    return fallback;
  }
}

// Infer the most likely language for a given ISO 3166-1 alpha-2 country code.
export function getCountryLanguage(countryCode, locale = "en") {
  if (!countryCode) return null;
  try {
    const region = String(countryCode).toUpperCase();

    // Handle specific Chinese regions
    const zhRegionMap = { CN: "zh-CN", TW: "zh-TW", HK: "zh-HK", SG: "zh-CN" };
    if (zhRegionMap[region]) {
      const code = zhRegionMap[region];
      const name =
        new Intl.DisplayNames([locale], { type: "language" }).of(code) || code;
      return { code, name };
    }

    const base = new Intl.Locale("und", { region });
    const maximized = base.maximize ? base.maximize() : base;
    const lang = maximized.language || "en";

    const displayNames = new Intl.DisplayNames([locale], { type: "language" });
    const name = displayNames.of(lang) || lang;

    return { code: lang, name };
  } catch (e) {
    console.warn(
      "TizenTube Subtitle Localization: Could not infer language for country",
      countryCode,
      e
    );
    return null;
  }
}

let isPatched = false;

// Function to get user's country code
function getUserCountryCode() {
  try {
    // window.yt.config_.GL is the most reliable source
    if (window.yt?.config_?.GL) {
      return window.yt.config_.GL;
    }

    console.warn(
      "TizenTube Subtitle Localization: Could not determine user country code"
    );
    return null;
  } catch (error) {
    console.error(
      "TizenTube Subtitle Localization: Error getting country code:",
      error
    );
    return null;
  }
}

// Function to get dynamic user language option name for settings UI
export function getUserLanguageOptionName() {
  const userCountryCode = getUserCountryCode();
  const userLanguage = getCountryLanguage(userCountryCode);
  if (userLanguage) {
    return `Show ${userLanguage.name} Subtitle`;
  }
  return "Show Local Subtitle";
}

/**
 * Helper to safely extract translation language object from a menu item.
 * @param {object} item - The subtitle menu item.
 * @returns {object | null} The translationLanguage object or null.
 */
function getTranslationLang(item) {
  try {
    const commands =
      item?.compactLinkRenderer?.serviceEndpoint?.commandExecutorCommand
        ?.commands;
    if (commands && commands[0]?.selectSubtitlesTrackCommand) {
      return commands[0].selectSubtitlesTrackCommand.translationLanguage;
    }
  } catch (e) {
    // Silently ignore errors in item parsing
  }
  return null;
}

/**
 * Gets a Set of all language codes and names already in the menu.
 * @param {Array<object>} items - The subtitle menu items.
 * @returns {Set<string>} A Set containing language codes and names.
 */
function getExistingLanguages(items) {
  const existingLanguages = new Set();
  for (const item of items) {
    const translationLang = getTranslationLang(item);
    if (translationLang) {
      existingLanguages.add(translationLang.languageCode);
      existingLanguages.add(translationLang.languageName);
    }
  }
  return existingLanguages;
}

// Function to create a language option
function createLanguageOption(languageCode, languageName) {
  return {
    compactLinkRenderer: {
      title: { simpleText: languageName },
      serviceEndpoint: {
        commandExecutorCommand: {
          commands: [
            {
              selectSubtitlesTrackCommand: {
                translationLanguage: {
                  languageCode: languageCode,
                  languageName: languageName,
                },
              },
            },
            {
              openClientOverlayAction: {
                type: "CLIENT_OVERLAY_TYPE_CAPTIONS_LANGUAGE",
                updateAction: true,
              },
            },
            { signalAction: { signal: "POPUP_BACK" } },
          ],
        },
      },
      secondaryIcon: { iconType: "RADIO_BUTTON_UNCHECKED" },
    },
  };
}

// Function to create section title
function createSectionTitle(title) {
  return {
    overlayMessageRenderer: {
      title: { simpleText: "" }, // Title is intentionally blank
      subtitle: { simpleText: title },
      style: "OVERLAY_MESSAGE_STYLE_SUBSECTION_TITLE",
    },
  };
}

// Main function to patch the subtitle menu
function patchSubtitleMenu() {
  if (isPatched) return;

  const yttvInstance = Object.values(window._yttv).find(
    (obj) => obj?.instance?.resolveCommand
  );

  if (!yttvInstance) {
    // Don't log error here, as it may just be too early.
    // The polling will try again.
    return;
  }

  if (yttvInstance.instance.resolveCommand.isPatchedBySubtitleLocalization) {
    console.log("TizenTube Subtitle Localization: Already patched.");
    isPatched = true; // Ensure state is correct
    return;
  }

  const originalResolveCommand = yttvInstance.instance.resolveCommand;

  yttvInstance.instance.resolveCommand = function (cmd, _) {
    // Check if this is the command for the auto-translate popup
    if (
      cmd?.openPopupAction?.uniqueId !==
      "CLIENT_OVERLAY_TYPE_CAPTIONS_AUTO_TRANSLATE"
    ) {
      return originalResolveCommand.apply(this, arguments);
    }

    // Check settings dynamically each time menu opens
    const showUserLanguage = configRead("enableShowUserLanguage");
    const showOtherLanguages = configRead("enableShowOtherLanguages");

    if (!showUserLanguage && !showOtherLanguages) {
      return originalResolveCommand.apply(this, arguments);
    }

    // Safely get the items array
    const items =
      cmd.openPopupAction.popup.overlaySectionRenderer?.overlay
        ?.overlayTwoPanelRenderer?.actionPanel?.overlayPanelRenderer?.content
        ?.overlayPanelItemListRenderer?.items;

    if (!items) {
      console.error(
        "TizenTube Subtitle Localization: Could not find subtitle items array."
      );
      return originalResolveCommand.apply(this, arguments);
    }

    // --- Start Modifications ---

    // 1. Get all languages already in the menu (efficiently)
    const existingLanguages = getExistingLanguages(items);

    // 2. Add user's local language if enabled and not present
    if (showUserLanguage) {
      const userCountryCode = getUserCountryCode();
      const userLanguage = getCountryLanguage(userCountryCode);

      if (userLanguage) {
        const langExists =
          existingLanguages.has(userLanguage.code) ||
          existingLanguages.has(userLanguage.name);

        if (!langExists) {
          console.log(
            `%c[TizenTube Subtitle] Adding user language: ${userLanguage.name} (${userLanguage.code})`,
            "background: #2196F3; color: #ffffff; font-size: 14px; font-weight: bold;"
          );
          const userLanguageOption = createLanguageOption(
            userLanguage.code,
            userLanguage.name
          );

          // Find insertion point
          const recommendedIndex = items.findIndex(
            (item) =>
              item.overlayMessageRenderer?.subtitle?.simpleText ===
              "Recommended languages"
          );

          if (recommendedIndex > -1) {
            items.splice(recommendedIndex + 1, 0, userLanguageOption);
          } else {
            // Fallback: Insert before "Other languages" or at start
            const otherLanguagesIndex = items.findIndex(
              (item) =>
                item.overlayMessageRenderer?.subtitle?.simpleText ===
                "Other languages"
            );
            if (otherLanguagesIndex > -1) {
              items.splice(otherLanguagesIndex, 0, userLanguageOption);
            } else {
              items.unshift(userLanguageOption); // Absolute fallback
            }
          }

          // **IMPORTANT: Update the set to prevent duplication**
          existingLanguages.add(userLanguage.code);
          existingLanguages.add(userLanguage.name);
        } else {
          console.log(
            `%c[TizenTube Subtitle] User language ${userLanguage.name} already in menu.`,
            "background: #4CAF50; color: #ffffff; font-size: 12px;"
          );
        }
      } else {
        console.warn(
          `TizenTube Subtitle: No language mapping for country: ${userCountryCode}`
        );
      }
    }

    // 3. Add all other missing languages if enabled
    if (showOtherLanguages) {
      const missingLanguages = Object.entries(getComprehensiveLanguageList())
        .filter(
          ([code, name]) =>
            !existingLanguages.has(code) && !existingLanguages.has(name)
        )
        .sort(([, a], [, b]) => a.localeCompare(b));

      if (missingLanguages.length > 0) {
        console.log(
          `%c[TizenTube Subtitle] Adding "Other Languages" section with ${missingLanguages.length} languages`,
          "background: #FF9800; color: #ffffff; font-size: 12px;"
        );

        // Add section title
        items.push(createSectionTitle("Other Languages"));

        // Add all missing languages
        missingLanguages.forEach(([code, name]) => {
          items.push(createLanguageOption(code, name));
        });
      } else {
        console.log(
          "%c[TizenTube Subtitle] All other languages already present in menu.",
          "background: #4CAF50; color: #ffffff; font-size: 12px;"
        );
      }
    }

    // --- End Modifications ---

    // Let the original function run with our modified 'cmd' object
    return originalResolveCommand.apply(this, arguments);
  };

  yttvInstance.instance.resolveCommand.isPatchedBySubtitleLocalization = true;
  console.log("TizenTube Subtitle Localization: Patch successful!");
  isPatched = true;
}

// Wait for the YouTube TV app to be ready
function initializeSubtitlePatch() {
  console.log(
    "TizenTube Subtitle Localization: Module loaded, waiting for YouTube TV..."
  );

  const interval = setInterval(() => {
    if (window._yttv && Object.keys(window._yttv).length > 0) {
      try {
        patchSubtitleMenu();
        if (isPatched) {
          clearInterval(interval);
        }
      } catch (e) {
        console.error(
          "TizenTube Subtitle Localization: Error during patching:",
          e
        );
        clearInterval(interval); // Stop on a critical error
      }
    }
  }, 1000);

  // Also try to patch when DOM is loaded (respects original author's intent)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", patchSubtitleMenu);
  } else {
    patchSubtitleMenu(); // Try immediately if already loaded
  }
}

initializeSubtitlePatch();

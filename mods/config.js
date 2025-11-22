const CONFIG_KEY = "ytaf-configuration";

const defaultConfig = {
  enableAdBlock: true,
  enableSponsorBlock: true,
  sponsorBlockManualSkips: ["intro", "outro", "filler"],
  enableSponsorBlockSponsor: true,
  enableSponsorBlockIntro: true,
  enableSponsorBlockOutro: true,
  enableSponsorBlockInteraction: true,
  enableSponsorBlockSelfPromo: true,
  enableSponsorBlockPreview: true,
  enableSponsorBlockMusicOfftopic: true,
  enableSponsorBlockFiller: false,
  videoSpeed: 1,
  enableDeArrow: false,
  enableDeArrowThumbnails: false,
  focusContainerColor: "#0f0f0f",
  routeColor: "#0f0f0f",
  // Simplified boolean check
  enableFixedUI: !(window.h5vcc && window.h5vcc.tizentube),
  enableHqThumbnails: true,
  enableChapters: true,
  enableLongPress: true,
  enableShorts: true,
  dontCheckUpdateUntil: 0,
  enableWhoIsWatchingMenu: false,
  enableShowUserLanguage: true,
  enableShowOtherLanguages: false,
};

/**
 * Loads configuration from localStorage and merges it with defaults.
 * This ensures all keys are present.
 * @returns {object} The fully merged configuration object.
 */
function loadConfig() {
  let savedConfig = {};
  try {
    const storedConfig = window.localStorage.getItem(CONFIG_KEY);
    if (storedConfig) {
      savedConfig = JSON.parse(storedConfig);
    }
  } catch (err) {
    console.warn("Config read failed, falling back to defaults:", err);
    // If parsing fails, we'll just use the defaults
  }

  // Merge saved config on top of defaults
  // This preserves saved settings while adding any new default keys
  return { ...defaultConfig, ...savedConfig };
}

// Load the config on module initialization
let localConfig = loadConfig();

/**
 * Reads a value from the configuration.
 * @param {string} key - The key to read.
 * @returns {*} The value from the config.
 */
export function configRead(key) {
  if (!(key in localConfig)) {
    console.warn(
      `Config key "${key}" does not exist in defaultConfig or saved config.`
    );
  }
  return localConfig[key];
}

/**
 * Writes a value to the configuration and saves it to localStorage.
 * @param {string} key - The key to write.
 * @param {*} value - The value to save.
 */
export function configWrite(key, value) {
  console.info("Setting key", key, "to", value);
  localConfig[key] = value;

  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(localConfig));
  } catch (err) {
    console.error("Failed to save config to localStorage:", err);
  }

  // Dispatch a change event
  configChangeEmitter.dispatchEvent(
    new CustomEvent("configChange", { detail: { key, value } })
  );
}

/**
 * A standard EventTarget for dispatching config change events.
 * Other modules can listen to this for changes.
 * * Example:
 * import { configChangeEmitter } from './config.js';
 * * configChangeEmitter.addEventListener('configChange', (event) => {
 * if (event.detail.key === 'someKey') {
 * // Do something
 * }
 * });
 */
export const configChangeEmitter = new EventTarget();

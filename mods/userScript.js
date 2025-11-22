// =============================================================================
// === Polyfills
// =============================================================================
// These MUST be imported first to patch the browser environment before any
// app logic runs.

// 1. For async/await functions (transpiled by Babel)
import "regenerator-runtime/runtime";

// 2. For the 'fetch' API
import "whatwg-fetch";

// 3. For modern JavaScript features (as specified in original file)
import "core-js/proposals/object-getownpropertydescriptors";

// 4. For DOM APIs
import "./domrect-polyfill";

// 5. For Intl.DisplayNames (used in 'moreSubtitles' feature)
import "@formatjs/intl-getcanonicallocales/polyfill.iife";
import "@formatjs/intl-locale/polyfill.iife";
import "@formatjs/intl-displaynames/polyfill.iife";
import "@formatjs/intl-displaynames/locale-data/en";

// =============================================================================
// === Application Logic
// =============================================================================
// Import all application features. The order here is less critical,
// but is now grouped logically for better maintainability.

// --- Core UI & Patches ---
import "./ui/ui.js";
import "./ui/settings.js";
import "./ui/theme.js";

// --- Feature Modules ---
import "./features/adblock.js";
import "./features/sponsorblock.js";
import "./features/moreSubtitles.js";
import "./features/pictureInPicture.js";
import "./features/updater.js";

// --- Specific UI Components ---
import "./ui/speedUI.js";
import "./ui/disableWhosWatching.js";

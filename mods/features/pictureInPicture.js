// Picture in Picture Mode for TizenTube

import resolveCommand from "../resolveCommand.js";

let PlayerService = null;
let searchBarObserver = null;
window.isPipPlaying = false;

/**
 * Initializes the PiP module by getting the PlayerService and
 * patching the PlaybackPreviewService to prevent hover-previews
 * from playing while PiP is active.
 */
function pipLoad() {
  const mappings = Object.values(window._yttv).find((a) => a && a.mappings);
  if (!mappings) return;

  PlayerService = mappings.get("PlayerService");
  const PlaybackPreviewService = mappings.get("PlaybackPreviewService");
  if (!PlaybackPreviewService) return;

  const PlaybackPreviewServiceStart = PlaybackPreviewService.start;
  const PlaybackPreviewServiceStop = PlaybackPreviewService.stop;

  PlaybackPreviewService.start = function (...args) {
    if (window.isPipPlaying) return;
    return PlaybackPreviewServiceStart.apply(this, args);
  };

  PlaybackPreviewService.stop = function (...args) {
    if (window.isPipPlaying) return;
    return PlaybackPreviewServiceStop.apply(this, args);
  };
}

// Wait for the app to load before trying to patch services
if (document.readyState === "complete") {
  pipLoad();
} else {
  window.addEventListener("load", pipLoad);
}

/**
 * Creates and inserts the "return to fullscreen" button in the search bar.
 * This function also includes the (previously missing) click handler.
 */
function createPipFullscreenButton() {
  const searchBar = document.querySelector("ytlr-search-bar");
  if (!searchBar || document.querySelector("#tt-pip-button")) {
    return; // Search bar not found or button already exists
  }

  const pipButton = document.createElement("ytlr-search-voice");
  pipButton.style.left = "10.25em";
  pipButton.id = "tt-pip-button";
  pipButton.setAttribute("idomkey", "ytLrSearchBarSearchVoice");
  pipButton.setAttribute("tabindex", "0");
  pipButton.classList.add("ytLrSearchVoiceHost", "ytLrSearchBarSearchVoice");

  const pipButtonMicButton = document.createElement(
    "ytlr-search-voice-mic-button"
  );
  pipButtonMicButton.setAttribute("hybridnavfocusable", "true");
  pipButtonMicButton.setAttribute("tabindex", "-1");
  pipButtonMicButton.classList.add("ytLrSearchVoiceMicButtonHost", "zylon-ve");

  const pipIcon = document.createElement("yt-icon");
  pipIcon.setAttribute("tabindex", "-1");
  // Using a "fullscreen" icon instead of "arrow left"
  pipIcon.classList.add(
    "ytContribIconTvFullscreen", // Changed from ytContribIconTvArrowLeft
    "ytContribIconHost",
    "ytLrSearchVoiceMicButtonIcon"
  );

  pipButtonMicButton.appendChild(pipIcon);
  pipButton.appendChild(pipButtonMicButton);

  // **CRITICAL FIX**: Add the click handler to make the button functional
  pipButton.onclick = pipToFullscreen;

  searchBar.appendChild(pipButton);
}

/**
 * Starts observing the DOM for the search bar to appear.
 * If the search bar is already present, it creates the button immediately.
 */
function startSearchBarObserver() {
  stopSearchBarObserver(); // Ensure only one is running

  // Try to create immediately in case it's already on-screen
  if (document.querySelector("ytlr-search-bar")) {
    createPipFullscreenButton();
    return; // No observer needed
  }

  // If not, create an observer to wait for it
  searchBarObserver = new MutationObserver(() => {
    if (document.querySelector("ytlr-search-bar")) {
      createPipFullscreenButton();
      stopSearchBarObserver(); // Found it, stop observing
    }
  });

  searchBarObserver.observe(document.body, { childList: true, subtree: true });
}

/**
 * Stops the search bar observer and removes the PiP button from the UI.
 */
function stopSearchBarObserver() {
  if (searchBarObserver) {
    searchBarObserver.disconnect();
    searchBarObserver = null;
  }
  // Also remove the button
  const pipButton = document.querySelector("#tt-pip-button");
  if (pipButton) {
    pipButton.remove();
  }
}

/**
 * Enables Picture-in-Picture mode.
 */
function enablePip() {
  if (!PlayerService) return;

  const videoElement = document.querySelector("video");
  const ytlrPlayer = document.querySelector("ytlr-player");
  const ytlrPlayerContainer = document.querySelector("ytlr-player-container");

  if (!videoElement || !ytlrPlayer || !ytlrPlayerContainer) {
    console.error("TizenTube PiP: Missing player elements.");
    return;
  }

  const timestamp = Math.floor(videoElement.currentTime);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === "class") {
        if (!ytlrPlayer.classList.contains("ytLrPlayerEnabled")) {
          // This block runs when the player is "minimized"
          observer.disconnect();

          function setStyles() {
            ytlrPlayerContainer.style.zIndex = "10";
            ytlrPlayer.style.display = "block";
            ytlrPlayer.style.backgroundColor = "rgba(0,0,0,0)";
          }

          setStyles();
          setTimeout(setStyles, 500); // Re-apply styles to override defaults

          function onPipEnter() {
            videoElement.style.removeProperty("inset");

            // PiP window styles
            const pipWidth = window.innerWidth / 3.5;
            const pipHeight = window.innerHeight / 3.5;
            videoElement.style.width = `${pipWidth}px`;
            videoElement.style.height = `${pipHeight}px`;
            videoElement.style.top = "68vh";
            videoElement.style.left = "68vw";

            window.isPipPlaying = true;
            videoElement.removeEventListener("play", onPipEnter);

            // Start looking for the search bar to add our button
            startSearchBarObserver();
          }

          videoElement.addEventListener("play", onPipEnter);

          setTimeout(() => {
            PlayerService.loadedPlaybackConfig.watchEndpoint.startTimeSeconds =
              timestamp;
            PlayerService.loadVideo(PlayerService.loadedPlaybackConfig);
          }, 1000);
        }
      }
    }
  });

  observer.observe(ytlrPlayer, { attributes: true });

  // Exit from the current video player (triggers the mutation)
  resolveCommand({
    signalAction: {
      signal: "HISTORY_BACK",
    },
  });
}

/**
 * Returns from PiP mode to a full-screen player.
 */
function pipToFullscreen() {
  const videoElement = document.querySelector("video");
  if (!PlayerService || !videoElement) return;

  const { clickTrackingParams, commandMetadata, watchEndpoint } =
    PlayerService.loadedPlaybackConfig;

  watchEndpoint.startTimeSeconds = Math.floor(videoElement.currentTime);

  const command = {
    clickTrackingParams,
    commandMetadata,
    watchEndpoint,
  };

  resolveCommand(command);

  // Clean up PiP state
  window.isPipPlaying = false;
  stopSearchBarObserver();
}

export { enablePip, pipToFullscreen };

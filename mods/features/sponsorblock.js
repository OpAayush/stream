import sha256 from "../tiny-sha256.js";
import { configRead } from "../config.js";
import { showToast } from "../ui/ytUI.js";

const SPONSORBLOCK_API = "https://sponsor.ajay.app/api";

// Copied from https://github.com/ajayyy/SponsorBlock/blob/da1a535de784540ee10166a75a3eb8537073838c/src/config.ts#L113-L134
const barTypes = {
  sponsor: { color: "#00d400", opacity: "0.7", name: "sponsored segment" },
  intro: { color: "#00ffff", opacity: "0.7", name: "intro" },
  outro: { color: "#0202ed", opacity: "0.7", name: "outro" },
  interaction: {
    color: "#cc00ff",
    opacity: "0.7",
    name: "interaction reminder",
  },
  selfpromo: { color: "#ffff00", opacity: "0.7", name: "self-promotion" },
  preview: { color: "#008fd6", opacity: "0.7", name: "recap or preview" },
  filler: { color: "#7300FF", opacity: "0.9", name: "tangents" },
  music_offtopic: { color: "#ff9900", opacity: "0.7", name: "non-music part" },
};

// Maps category name to the configRead key
const CATEGORY_CONFIG_MAP = {
  sponsor: "enableSponsorBlockSponsor",
  intro: "enableSponsorBlockIntro",
  outro: "enableSponsorBlockOutro",
  interaction: "enableSponsorBlockInteraction",
  selfpromo: "enableSponsorBlockSelfPromo",
  preview: "enableSponsorBlockPreview",
  filler: "enableSponsorBlockFiller",
  music_offtopic: "enableSponsorBlockMusicOfftopic",
};

/**
 * Helper function to apply a map of CSS styles to an element.
 * @param {HTMLElement} element
 * @param {Object<string, string>} styles
 */
function applyStyles(element, styles) {
  for (const [key, value] of Object.entries(styles)) {
    // Use 'setProperty' for robustness, especially with !important
    element.style.setProperty(
      key,
      value,
      value.includes("!important") ? "important" : ""
    );
  }
}

class SponsorBlockHandler {
  video = null;
  active = true;

  attachVideoTimeout = null;
  nextSkipTimeout = null;
  sliderInterval = null;

  observer = null;
  scheduleSkipHandler = null;
  durationChangeHandler = null;

  segments = [];
  nextSegmentIndex = 0; // For performance
  skippableCategories = [];
  manualSkippableCategories = [];

  constructor(videoID) {
    this.videoID = videoID;
  }

  async init() {
    // Get categories from our barTypes map
    const categories = Object.keys(barTypes);
    const videoHash = sha256(this.videoID).substring(0, 4);

    try {
      const resp = await fetch(
        `${SPONSORBLOCK_API}/skipSegments/${videoHash}?categories=${encodeURIComponent(
          JSON.stringify(categories)
        )}`
      );
      const results = await resp.json();
      const result = results.find((v) => v.videoID === this.videoID);

      console.info(this.videoID, "SponsorBlock segments:", result);

      if (!result || !result.segments || !result.segments.length) {
        console.info(this.videoID, "No segments found.");
        return;
      }

      // **PERFORMANCE**: Sort segments by start time ONCE
      this.segments = result.segments.sort(
        (a, b) => a.segment[0] - b.segment[0]
      );
      this.nextSegmentIndex = 0;

      this.updateSkippableCategories();

      this.scheduleSkipHandler = () => this.scheduleSkip();
      this.durationChangeHandler = () => this.buildOverlay();

      this.attachVideo();
      this.buildOverlay();
    } catch (err) {
      console.error(
        this.videoID,
        "Failed to fetch SponsorBlock segments:",
        err
      );
    }
  }

  /**
   * Reads config and updates which categories are auto-skippable.
   */
  updateSkippableCategories() {
    this.manualSkippableCategories = configRead("sponsorBlockManualSkips");

    // Refactored to use the config map
    this.skippableCategories = Object.entries(CATEGORY_CONFIG_MAP)
      .filter(([, configKey]) => configRead(configKey))
      .map(([category]) => category);
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    this.video = document.querySelector("video");
    if (!this.video) {
      console.info(this.videoID, "No video yet, retrying...");
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 100);
      return;
    }

    console.info(this.videoID, "Video found, binding SponsorBlock...");

    this.video.addEventListener("play", this.scheduleSkipHandler);
    this.video.addEventListener("pause", this.scheduleSkipHandler);
    this.video.addEventListener("timeupdate", this.scheduleSkipHandler);
    this.video.addEventListener("durationchange", this.durationChangeHandler);
  }

  buildOverlay() {
    if (this.segmentsoverlay) {
      console.info("Overlay already built");
      return;
    }

    if (!this.video || !this.video.duration) {
      console.info("No video duration yet");
      return;
    }

    const videoDuration = this.video.duration;

    this.segmentsoverlay = document.createElement("div");
    this.segmentsoverlay.classList.add(
      "ytLrProgressBarHost",
      "ytLrProgressBarFocused",
      "ytLrWatchDefaultProgressBar"
    );

    const sliderElement = document.createElement("div");
    applyStyles(sliderElement, {
      "background-color": "rgb(0, 0, 0, 0)",
      bottom: "auto !important",
      height: "0.25rem !important",
      overflow: "hidden !important",
      position: "absolute !important",
      top: "1.625rem !important",
      width: "100% !important",
    });
    this.segmentsoverlay.appendChild(sliderElement);

    const baseSegmentStyles = {
      height: "100%",
      "pointer-events": "none",
      position: "absolute",
      "transform-origin": "left",
      width: "100%",
    };

    this.segments.forEach((segment) => {
      const [start, end] = segment.segment;
      const barType = barTypes[segment.category] || {
        color: "blue",
        opacity: 0.7,
      };
      const transform = `translateX(${
        (start / videoDuration) * 100.0
      }%) scaleX(${(end - start) / videoDuration})`;

      const elm = document.createElement("div");
      applyStyles(elm, baseSegmentStyles);
      applyStyles(elm, {
        background: `${barType.color} !important`,
        opacity: `${barType.opacity} !important`,
        transform: `${transform} !important`,
      });

      sliderElement.appendChild(elm);
    });

    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.removedNodes) {
          for (const node of m.removedNodes) {
            if (node === this.segmentsoverlay) {
              console.info("SponsorBlock: re-attaching segments overlay");
              this.slider.appendChild(this.segmentsoverlay);
            }
          }
        }

        // Match progress bar focus state
        const progressBar = document.querySelector("ytlr-progress-bar");
        if (progressBar?.getAttribute("hybridnavfocusable") === "false") {
          this.segmentsoverlay.classList.remove("ytLrProgressBarFocused");
        } else {
          this.segmentsoverlay.classList.add("ytLrProgressBarFocused");
        }
      });
    });

    this.sliderInterval = setInterval(() => {
      this.slider = document.querySelector(
        "ytlr-redux-connect-ytlr-progress-bar"
      );
      if (this.slider) {
        clearInterval(this.sliderInterval);
        this.sliderInterval = null;
        this.observer.observe(this.slider, {
          childList: true,
          subtree: true,
        });
        this.slider.appendChild(this.segmentsoverlay);
      }
    }, 500);
  }

  /**
   * Finds the next skippable segment and schedules a skip.
   * Called on 'timeupdate', 'play', 'pause'.
   */
  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;

    if (!this.active || this.video.paused) {
      return;
    }

    const now = this.video.currentTime;

    // **PERFORMANCE**: Start searching from the last known segment index
    let nextSegment = null;
    for (let i = this.nextSegmentIndex; i < this.segments.length; i++) {
      const seg = this.segments[i];
      // Use original "look back" logic to catch segments we just entered
      if (seg.segment[1] > now - 0.3) {
        nextSegment = seg;
        this.nextSegmentIndex = i; // Store the index for the next run
        break;
      }
    }

    if (!nextSegment) {
      // console.info(this.videoID, "No more segments");
      return;
    }

    const [start, end] = nextSegment.segment;

    // We are currently inside a segment, skip it immediately
    if (now >= start && now < end) {
      this.performSkip(nextSegment);
    }
    // The next segment is in the future, schedule a timeout
    else if (now < start) {
      this.nextSkipTimeout = setTimeout(() => {
        // Re-check state in case user paused, etc.
        if (this.video.paused || !this.active) {
          return;
        }
        this.performSkip(nextSegment);
      }, (start - now) * 1000);
    }
  }

  /**
   * Executes the skip for a given segment.
   * @param {object} segment
   */
  performSkip(segment) {
    // Check if category is enabled for auto-skip
    if (!this.skippableCategories.includes(segment.category)) {
      console.info(
        this.videoID,
        "Segment",
        segment.category,
        "is not skippable, ignoring..."
      );
      return;
    }

    // Check if category is set to "manual" (show button)
    if (this.manualSkippableCategories.includes(segment.category)) {
      console.info(
        this.videoID,
        "Segment",
        segment.category,
        "is manual-skip, ignoring..."
      );
      return;
    }

    const [start, end] = segment.segment;
    const skipName = barTypes[segment.category]?.name || segment.category;

    console.info(this.videoID, "Skipping", segment);
    showToast("SponsorBlock", `Skipping ${skipName}`);

    this.video.currentTime = end + 0.1;

    // Immediately check for the *next* segment
    // This prevents a delay from 'timeupdate'
    this.scheduleSkip();
  }

  destroy() {
    console.info(this.videoID, "Destroying SponsorBlock handler");

    this.active = false;

    if (this.nextSkipTimeout) {
      clearTimeout(this.nextSkipTimeout);
      this.nextSkipTimeout = null;
    }

    if (this.attachVideoTimeout) {
      clearTimeout(this.attachVideoTimeout);
      this.attachVideoTimeout = null;
    }

    if (this.sliderInterval) {
      clearInterval(this.sliderInterval);
      this.sliderInterval = null;
    }

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.segmentsoverlay) {
      this.segmentsoverlay.remove();
      this.segmentsoverlay = null;
    }

    if (this.video) {
      this.video.removeEventListener("play", this.scheduleSkipHandler);
      this.video.removeEventListener("pause", this.scheduleSkipHandler);
      this.video.removeEventListener("timeupdate", this.scheduleSkipHandler);
      this.video.removeEventListener(
        "durationchange",
        this.durationChangeHandler
      );
    }
  }
}

// Global handler, attached to window to work around browser issues
window.sponsorblock = null;

window.addEventListener(
  "hashchange",
  () => {
    const newURL = new URL(location.hash.substring(1), location.href);

    // Use URLSearchParams for robust parsing
    const videoID = newURL.searchParams.get("v");

    const needsReload =
      videoID &&
      (!window.sponsorblock || window.sponsorblock.videoID != videoID);

    if (needsReload) {
      if (window.sponsorblock) {
        try {
          window.sponsorblock.destroy();
        } catch (err) {
          console.warn("window.sponsorblock.destroy() failed!", err);
        }
        window.sponsorblock = null;
      }

      if (configRead("enableSponsorBlock")) {
        window.sponsorblock = new SponsorBlockHandler(videoID);
        window.sponsorblock.init();
      } else {
        console.info("SponsorBlock disabled, not loading");
      }
    }
  },
  false
);

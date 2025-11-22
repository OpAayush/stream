import { configRead } from "../config.js";
import { timelyAction, longPressData } from "../ui/ytUI.js";
import { PatchSettings } from "../ui/customYTSettings.js";

/**
 * Comments explaining the original purpose (uBlock ad-blocking)
 * are retained for context.
 */
const origParse = JSON.parse;

/**
 * Patched JSON.parse function.
 * Acts as a central dispatcher that modifies the parsed object 'r'.
 */
JSON.parse = function () {
  const r = origParse.apply(this, arguments);

  // Guard against non-object or null results
  if (!r || typeof r !== "object") {
    return r;
  }

  // Read all configs at once and pass them down
  const config = {
    enableAdBlock: configRead("enableAdBlock"),
    enableShorts: configRead("enableShorts"),
    sponsorBlockManualSkips: configRead("sponsorBlockManualSkips") || [],
    enableDeArrow: configRead("enableDeArrow"),
    enableDeArrowThumbnails: configRead("enableDeArrowThumbnails"),
    enableHqThumbnails: configRead("enableHqThumbnails"),
    enableLongPress: configRead("enableLongPress"),
  };

  // --- Apply Modifications ---

  if (config.enableAdBlock) {
    handleAdBlocking(r);
  }

  // This appears to be unconditional
  handleQualitySettings(r);

  // Patch settings UI
  if (r?.title?.runs) {
    PatchSettings(r);
  }

  // Process video/content shelves (DeArrow, HQ Thumbs, Long Press)
  handleContentProcessing(r, config);

  if (!config.enableShorts) {
    handleRemoveShorts(r);
  }

  if (config.sponsorBlockManualSkips.length > 0) {
    handleSponsorBlock(r, config.sponsorBlockManualSkips);
  }

  return r;
};

// Apply the patch to the window and any related contexts
window.JSON.parse = JSON.parse;
for (const key in window._yttv) {
  if (window._yttv[key]?.JSON?.parse) {
    window._yttv[key].JSON.parse = JSON.parse;
  }
}

// --- Handler Functions ---

/**
 * Removes various ad-related properties from the parsed object.
 * @param {object} r The parsed JSON object.
 */
function handleAdBlocking(r) {
  // Player-level ads
  if (r.adPlacements) r.adPlacements = [];
  if (r.playerAds) r.playerAds = false;
  if (r.adSlots) r.adSlots = [];

  // Drop "masthead" ad from home screen
  const contents =
    r?.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content
      ?.sectionListRenderer?.contents;
  if (contents) {
    r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents =
      contents.filter((elm) => !elm.adSlotRenderer);

    // Filter ads from shelves
    for (const shelve of r.contents.tvBrowseRenderer.content
      .tvSurfaceContentRenderer.content.sectionListRenderer.contents) {
      if (shelve.shelfRenderer?.content?.horizontalListRenderer?.items) {
        shelve.shelfRenderer.content.horizontalListRenderer.items =
          shelve.shelfRenderer.content.horizontalListRenderer.items.filter(
            (item) => !item.adSlotRenderer
          );
      }
    }
  }

  // Remove shorts ads
  if (!Array.isArray(r) && r?.entries) {
    r.entries = r.entries.filter(
      (elm) => !elm?.command?.reelWatchEndpoint?.adClientParams?.isAd
    );
  }
}

/**
 * Forces higher quality video and audio settings.
 * @param {object} r The parsed JSON object.
 */
function handleQualitySettings(r) {
  if (r?.streamingData?.adaptiveFormats) {
    r.streamingData.adaptiveFormats = r.streamingData.adaptiveFormats.map(
      (format) => {
        delete format.targetDurationSec;
        delete format.maxDvrDurationSec;
        if (format.qualityLabel) format.quality = format.quality || "hd1080";
        return format;
      }
    );
  }

  if (r?.playerConfig?.streamSelectionConfig) {
    r.playerConfig.streamSelectionConfig.maxBitrate = "MAX";
  }

  if (r?.responseContext?.webResponseContext) {
    const webContext = r.responseContext.webResponseContext;
    webContext.playerConfig = webContext.playerConfig || {};
    webContext.playerConfig.preferredQuality = "hd1440";
  }

  if (r?.playbackTracking) {
    r.playbackTracking.setAutoQuality = false;
  }

  if (r?.videoDetails) {
    r.playerConfig = r.playerConfig || {};
    r.playerConfig.audioConfig = r.playerConfig.audioConfig || {};
    r.playerConfig.audioConfig.enablePerFormatLoudness = false;
    r.streamingData = r.streamingData || {};
    r.streamingData.formatSelection = { selectedQuality: "hd1440" };
  }
}

/**
 * Dispatches processing for various content lists and renderers.
 * @param {object} r The parsed JSON object.
 * @param {object} config The configuration object.
 */
function handleContentProcessing(r, config) {
  // Home screen shelves
  const tvBrowseContents =
    r?.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content
      ?.sectionListRenderer?.contents;
  if (tvBrowseContents) {
    processShelves(tvBrowseContents, config);
  }

  // Search results / Channel page shelves
  if (r?.contents?.sectionListRenderer?.contents) {
    processShelves(r.contents.sectionListRenderer.contents, config);
  }

  // Continuation shelves (e.g., scrolling down)
  if (r?.continuationContents?.sectionListContinuation?.contents) {
    processShelves(
      r.continuationContents.sectionListContinuation.contents,
      config
    );
  }

  // Horizontal continuation (e.g., scrolling right on a shelf)
  const horizontalItems =
    r?.continuationContents?.horizontalListContinuation?.items;
  if (horizontalItems) {
    processItems(horizontalItems, config);
  }

  // Watch next results (sidebar)
  if (r?.contents?.singleColumnWatchNextResults?.results?.results?.contents) {
    for (const content of r.contents.singleColumnWatchNextResults.results
      .results.contents) {
      const items =
        content.shelfRenderer?.content?.horizontalListRenderer?.items;
      if (items) {
        processItems(items, config);
      }

      if (content.itemSectionRenderer?.contents) {
        for (const item of content.itemSectionRenderer.contents) {
          if (item.compactVideoRenderer?.thumbnail?.thumbnails) {
            hqifyCompactRenderer(
              item.compactVideoRenderer,
              config.enableHqThumbnails
            );
          }
        }
      }
    }
  }

  // Autoplay next video overlay
  const autoplayRenderer =
    r?.playerOverlays?.playerOverlayRenderer?.autoplay
      ?.playerOverlayAutoplayRenderer?.videoDetails?.compactVideoRenderer;
  if (autoplayRenderer?.thumbnail?.thumbnails) {
    hqifyCompactRenderer(autoplayRenderer, config.enableHqThumbnails);
  }
}

/**
 * Removes shorts shelves from the home screen.
 * @param {object} r The parsed JSON object.
 */
function handleRemoveShorts(r) {
  const tvBrowseContents =
    r?.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content
      ?.sectionListRenderer?.contents;

  if (tvBrowseContents) {
    r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents =
      tvBrowseContents.filter(
        (shelve) =>
          shelve.shelfRenderer?.tvhtml5ShelfRendererType !==
          "TVHTML5_SHELF_RENDERER_TYPE_SHORTS"
      );
  }
}

/**
 * Adds manual skip buttons for SponsorBlock segments.
 * @param {object} r The parsed JSON object.
 * @param {string[]} manualSkips - Array of segment categories to create skips for.
 */
function handleSponsorBlock(r, manualSkips) {
  if (
    !r?.playerOverlays?.playerOverlayRenderer ||
    !window?.sponsorblock?.segments
  ) {
    return;
  }

  const timelyActions = window.sponsorblock.segments
    .filter((segment) => manualSkips.includes(segment.category))
    .map((segment) =>
      timelyAction(
        `Skip ${segment.category}`,
        "SKIP_NEXT",
        {
          clickTrackingParams: null,
          showEngagementPanelEndpoint: {
            customAction: {
              action: "SKIP",
              parameters: { time: segment.segment[1] },
            },
          },
        },
        segment.segment[0] * 1000,
        segment.segment[1] * 1000 - segment.segment[0] * 1000
      )
    );

  r.playerOverlays.playerOverlayRenderer.timelyActionRenderers = timelyActions;
}

// --- Helper Functions ---

/**
 * Processes a list of shelves.
 * @param {Array<object>} shelves - Array of shelf renderers.
 * @param {object} config The configuration object.
 */
function processShelves(shelves, config) {
  if (!shelves) return;
  for (const shelve of shelves) {
    const items = shelve.shelfRenderer?.content?.horizontalListRenderer?.items;
    if (items) {
      processItems(items, config);
    }
  }
}

/**
 * Processes a list of items (videos, etc.) within a shelf.
 * @param {Array<object>} items - Array of item renderers.
 * @param {object} config The configuration object.
 */
function processItems(items, config) {
  if (!items) return;

  // Filter ads first (iterate backwards for safe splicing)
  if (config.enableAdBlock) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].adSlotRenderer) {
        items.splice(i, 1);
      }
    }
  }

  // Apply other features to the cleaned list
  if (config.enableDeArrow) {
    deArrowify(items, config.enableDeArrowThumbnails);
  }
  if (config.enableHqThumbnails) {
    hqify(items, config.enableHqThumbnails);
  }
  if (config.enableLongPress) {
    addLongPress(items, config.enableLongPress);
  }
}

/**
 * Applies DeArrow titles and thumbnails to a list of items.
 * @param {Array<object>} items - Array of item renderers.
 * @param {boolean} enableThumbnails - Whether to also replace thumbnails.
 */
function deArrowify(items, enableThumbnails) {
  for (const item of items) {
    const videoID = item.tileRenderer?.contentId;
    if (!videoID) continue;

    fetch(`https://sponsor.ajay.app/api/branding?videoID=${videoID}`)
      .then((res) => res.json())
      .then((data) => {
        // Replace title
        if (data.titles?.length > 0) {
          const mostVoted = data.titles.reduce((max, title) =>
            max.votes > title.votes ? max : title
          );
          item.tileRenderer.metadata.tileMetadataRenderer.title.simpleText =
            mostVoted.title;
        }

        // Replace thumbnail
        if (enableThumbnails && data.thumbnails?.length > 0) {
          const mostVotedThumbnail = data.thumbnails.reduce((max, thumbnail) =>
            max.votes > thumbnail.votes ? max : thumbnail
          );
          if (mostVotedThumbnail.timestamp) {
            item.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails = [
              {
                url: `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${videoID}&time=${mostVotedThumbnail.timestamp}`,
                width: 1280,
                height: 640,
              },
              {}, // Empty object as placeholder, mimicking original structure
            ];
          }
        }
      })
      .catch(() => {}); // Silently fail on network error
  }
}

/**
 * Applies HQ thumbnails to a list of shelf items.
 * @param {Array<object>} items - Array of item renderers.
 * @param {boolean} enableHq - Whether HQ thumbnails are enabled.
 */
function hqify(items, enableHq) {
  if (!enableHq) return;
  for (const item of items) {
    const thumbnails =
      item.tileRenderer?.header?.tileHeaderRenderer?.thumbnail?.thumbnails;
    if (thumbnails) {
      hqifyThumbnailArray(thumbnails, enableHq);
    }
  }
}

/**
 * Applies HQ thumbnails to a compact video renderer (e.g., watch next, autoplay).
 * @param {object} compactVideoRenderer
 * @param {boolean} enableHq - Whether HQ thumbnails are enabled.
 */
function hqifyCompactRenderer(compactVideoRenderer, enableHq) {
  if (!enableHq) return;
  const thumbnails = compactVideoRenderer?.thumbnail?.thumbnails;
  if (thumbnails) {
    hqifyThumbnailArray(thumbnails, enableHq);
  }
}

/**
 * Replaces a thumbnail array with max-resolution versions.
 * @param {Array<object>} thumbnails - The thumbnail array to modify.
 * @param {boolean} enableHq - Whether HQ thumbnails are enabled.
 */
function hqifyThumbnailArray(thumbnails, enableHq) {
  if (!enableHq || !thumbnails?.length) return;

  const originalUrl = thumbnails[0].url;
  if (!originalUrl?.includes("i.ytimg.com/vi/")) return;

  try {
    const urlObj = new URL(originalUrl);
    const videoID = urlObj.pathname.split("/")[2];
    const queryArgs = urlObj.search; // Preserve query args (e.g., for rounded corners)

    if (!videoID) return;

    const maxresUrl = `https://i.ytimg.com/vi/${videoID}/maxresdefault.jpg${
      queryArgs || ""
    }`;
    const sddefUrl = `https://i.ytimg.com/vi/${videoID}/sddefault.jpg${
      queryArgs || ""
    }`;
    const hqdefUrl = `https://i.ytimg.com/vi/${videoID}/hqdefault.jpg${
      queryArgs || ""
    }`;

    // Clear existing array and push new URLs
    thumbnails.length = 0;
    thumbnails.push(
      { url: maxresUrl, width: 1280, height: 720 },
      { url: sddefUrl, width: 640, height: 480 },
      { url: hqdefUrl, width: 480, height: 360 }
    );
  } catch (e) {
    console.error("TizenTube: Failed to hqify thumbnail", e, originalUrl);
  }
}

/**
 * Adds long-press functionality to items.
 * @param {Array<object>} items - Array of item renderers.
 * @param {boolean} enableLongPress - Whether long press is enabled.
 */
function addLongPress(items, enableLongPress) {
  if (!enableLongPress) return;

  for (const item of items) {
    const tile = item.tileRenderer;
    if (
      !tile ||
      tile.style !== "TILE_STYLE_YTLR_DEFAULT" ||
      tile.onLongPressCommand
    ) {
      continue;
    }

    const metadata = tile.metadata?.tileMetadataRenderer;
    const subtitleItem =
      metadata?.lines?.[0]?.lineRenderer?.items?.[0]?.lineItemRenderer?.text;

    if (
      !subtitleItem ||
      !metadata?.title?.simpleText ||
      !tile.contentId ||
      !tile.onSelectCommand?.watchEndpoint
    ) {
      continue;
    }

    const subtitle = subtitleItem.runs
      ? subtitleItem.runs[0].text
      : subtitleItem.simpleText;

    tile.onLongPressCommand = longPressData({
      videoId: tile.contentId,
      thumbnails: tile.header?.tileHeaderRenderer?.thumbnail?.thumbnails,
      title: metadata.title.simpleText,
      subtitle: subtitle,
      watchEndpointData: tile.onSelectCommand.watchEndpoint,
    });
  }
}

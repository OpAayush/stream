const originalConsole = { ...console };

const webhookUrl =
  "https://discord.com/api/webhooks/1442775521543979119/eEY6zwp9Q1zlQ7kICeiGhpkC04ybjVvms6J3OCZt2h0I_il8iDLyQacIrk8CZ8vFnWuL";

const logColors = {
  log: "",
  info: "\u001b[34m",
  warn: "\u001b[31m",
  error: "\u001b[41m",
  debug: "\u001b[30m",
};

const MAX_LENGTH = 1800;

function sendWebhook(message, username = "Console Logger") {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", webhookUrl, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onerror = function () {
      originalConsole.error("Webhook XHR error");
    };
    xhr.send(JSON.stringify({ content: message, username }));
  } catch (e) {
    originalConsole.error("Webhook error:", e);
  }
}

function splitMessage(message, maxLength) {
  const chunks = [];
  let current = "";
  for (const line of message.split("\n")) {
    if (current.length + line.length + 1 > maxLength) {
      if (current) chunks.push(current.trimEnd());
      current = "";
    }
    current += line + "\n";
  }
  if (current) chunks.push(current.trimEnd());
  return chunks;
}

function sendImmediate(type, message) {
  const color = logColors[type] || "";
  const formatted = color + message + "\u001b[0m";
  const parts = splitMessage(formatted, MAX_LENGTH);
  for (const part of parts) {
    sendWebhook("```ansi\n" + part + "\n```");
  }
}

["log", "info", "warn", "error", "debug"].forEach(function (method) {
  console[method] = function () {
    const args = Array.prototype.slice.call(arguments);
    const message = args
      .map(function (a) {
        return typeof a === "string" ? a : JSON.stringify(a);
      })
      .join(" ");
    sendImmediate(method, message);
    originalConsole[method].apply(console, args);
  };
});

console.log("User script loaded: Webhook console logger");

// ...existing code...
import "whatwg-fetch";
import "core-js/proposals/object-getownpropertydescriptors";
import "@formatjs/intl-getcanonicallocales/polyfill.iife";
import "@formatjs/intl-locale/polyfill.iife";
import "@formatjs/intl-displaynames/polyfill.iife";
import "@formatjs/intl-displaynames/locale-data/en";

import "./domrect-polyfill";
import "./features/adblock.js";
import "./features/sponsorblock.js";
import "./ui/ui.js";
import "./ui/speedUI.js";
import "./ui/theme.js";
import "./ui/settings.js";
import "./ui/disableWhosWatching.js";
import "./features/moreSubtitles.js";
import "./features/updater.js";
import "./features/pictureInPicture.js";
import "./ui/customUI.js";

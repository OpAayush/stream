const dial = require("@patrickkfkan/peer-dial");
const express = require("express");
const cors = require("cors");

const app = express();

// --- Constants ---
const PORT = 8085;
const APP_NAME = "YouTube";
let TB_PACKAGE_ID;
let TIZENBREW_APP_ID;

try {
  // Fetch the package ID once at startup
  TB_PACKAGE_ID = tizen.application.getAppInfo().packageId;
  TIZENBREW_APP_ID = `${TB_PACKAGE_ID}.TizenBrewStandalone`;
} catch (e) {
  console.error("CRITICAL: Could not get Tizen package ID.", e);
  // This is a fatal error, the service cannot function without the ID.
  // In a real-world scenario, you might exit.
  // For this context, we'll let it fail later if TIZENBREW_APP_ID is used.
}

// --- Express & CORS Setup ---
const corsOptions = {
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// --- Application Registry ---
const apps = {
  [APP_NAME]: {
    name: APP_NAME,
    state: "stopped",
    allowStop: true,
    pid: null,
    additionalData: {},
    launch(launchData) {
      if (!TIZENBREW_APP_ID) {
        console.error("Cannot launch app: TizenBrew App ID is not set.");
        return;
      }
      const appControlData = new tizen.ApplicationControlData("module", [
        JSON.stringify({
          moduleName: "opaayush/tizentube",
          moduleType: "gh",
          args: launchData,
        }),
      ]);

      const appControl = new tizen.ApplicationControl(
        "http://tizen.org/appcontrol/operation/view",
        null,
        null,
        null,
        [appControlData]
      );

      tizen.application.launchAppControl(appControl, TIZENBREW_APP_ID);
    },
  },
};

// --- DIAL Server Setup ---
const dialServer = new dial.Server({
  expressApp: app,
  port: PORT,
  prefix: "/dial",
  manufacturer: "OpAayush",
  modelName: "TizenBrew",
  friendlyName: "TizenTube",
  delegate: {
    getApp(appName) {
      return apps[appName];
    },

    launchApp(appName, launchData, callback) {
      console.log(
        `Got request to launch ${appName} with launch data: ${launchData}`
      );
      const app = apps[appName];
      if (!app) {
        console.warn(`Request to launch unknown app: ${appName}`);
        return callback(null); // Signal app not found
      }

      // Use URLSearchParams for robust query string parsing
      const parsedData = Object.fromEntries(new URLSearchParams(launchData));

      // This "yumi" check appears to be a special case to set data
      // without launching the app (e.g., from a paired device)
      if (parsedData.yumi) {
        app.additionalData = parsedData;
        app.state = "running";
        return callback(""); // Return empty PID, but success
      }

      app.pid = "run"; // Using a static PID
      app.state = "starting";
      app.launch(launchData);
      app.state = "running"; // Assume launch is successful

      callback(app.pid);
    },

    stopApp(appName, pid, callback) {
      console.log(`Got request to stop ${appName} with pid: ${pid}`);
      const app = apps[appName];

      if (!app) {
        console.warn(`Request to stop unknown app: ${appName}`);
        return callback(false);
      }

      if (app.pid === pid) {
        app.pid = null;
        app.state = "stopped";
        callback(true);
      } else {
        console.warn(`PID mismatch while stopping ${appName}.`);
        callback(false);
      }
    },
  },
});

// --- State Synchronization ---
// Poll to check if the Tizen app is still running
setInterval(() => {
  if (!TIZENBREW_APP_ID) return; // Don't poll if we don't have an ID

  tizen.application.getAppsContext((appsContext) => {
    const isRunning = appsContext.some((app) => app.appId === TIZENBREW_APP_ID);

    if (!isRunning && apps[APP_NAME].state === "running") {
      console.log("TizenBrew app is not running. Setting state to stopped.");
      apps[APP_NAME].state = "stopped";
      apps[APP_NAME].pid = null;
      apps[APP_NAME].additionalData = {};
    }
  });
}, 5000);

// --- Start Server ---
// **FIX:** Removed redundant app.listen(). dialServer.start() handles it.
dialServer.start();
console.log(`TizenTube DIAL server started on port ${PORT}`);

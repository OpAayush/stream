import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default {
  // The entry point for your service
  input: "service.js",

  // --- External Dependencies ---
  // **CRITICAL FIX**: This tells Rollup to not bundle the 'tizen' API.
  // It will be provided by the Tizen environment at runtime.
  external: ["tizen"],

  // --- Input Plugins ---
  // These run on a per-module basis
  plugins: [
    // Resolves Node.js modules from node_modules (e.g., express, cors)
    nodeResolve({
      // We are building for a Node-like service, not a browser.
      // `preferBuiltins: true` is correct for a Node environment.
      preferBuiltins: true,
    }),

    // Converts CommonJS modules (like express) into ES modules
    commonjs({
      include: /node_modules/,
      transformMixedEsModules: true,
    }),
  ],

  // --- Output Configuration ---
  output: {
    file: "../dist/service.js",
    format: "iife", // Self-executing function, good for a service script

    // Maps the 'tizen' external import to the global 'tizen' variable
    globals: {
      tizen: "tizen",
    },

    // --- Output Plugins ---
    // These run on the final bundled file
    plugins: [
      // Minify the final service file
      terser(),
    ],
  },
};

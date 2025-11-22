import { string } from "rollup-plugin-string";
import terser from "@rollup/plugin-terser";
// Import the standard `babel` plugin instead of `getBabelOutputPlugin`
import { babel } from "@rollup/plugin-babel";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "userScript.js",

  // --- Input Plugins ---
  // Plugins here run on individual modules
  plugins: [
    string({
      include: "**/*.css",
    }),

    nodeResolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs({
      include: [/node_modules/, /mods/],
      transformMixedEsModules: true,
    }),

    // **THIS IS THE CHANGE**:
    // Move Babel to the main plugins array to run on individual modules.
    babel({
      // Tell Babel to bundle its helpers
      babelHelpers: "bundled",
      // Add exclude to avoid processing node_modules
      exclude: "node_modules/**",
      presets: [
        [
          "@babel/preset-env",
          {
            targets: "Chrome 47",
          },
        ],
      ],
    }),
  ],

  // --- Output Configuration ---
  output: {
    file: "../dist/userScript.js",
    format: "iife",
    // We removed getBabelOutputPlugin from here
    plugins: [
      terser({
        ecma: 5,
        mangle: true,
        compress: true,
      }),
    ],
  },
};

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { fileURLToPath } from "node:url";

import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // A stray package-lock.json in the parent directory otherwise wins the
  // workspace-root inference and Next traces files from there.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
};

export default config;

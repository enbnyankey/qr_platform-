#!/usr/bin/env node
/**
 * Runs the Prisma CLI with the repo-root .env / .env.local loaded, so every app and
 * Prisma read the same DATABASE_URL. Usage: node scripts/prisma.js <prisma args>
 */
const path = require("path");
const { spawnSync } = require("child_process");
const dotenv = require("dotenv");

const root = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

const bin = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: path.resolve(__dirname, ".."),
  env: process.env,
});
process.exit(result.status ?? 1);

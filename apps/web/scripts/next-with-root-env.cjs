// Starts Next.js with the repo-root .env/.env.local loaded and the ports from the
// root package.json ("ports"), so the web app always runs on the same fixed port
// and knows where the API is. Usage: node scripts/next-with-root-env.cjs dev|start|build
const path = require("node:path");
const { loadEnvConfig } = require("@next/env");

const root = path.resolve(__dirname, "../../..");
loadEnvConfig(root);

const fixed = require(path.join(root, "package.json")).ports || {};
const webPort = Number(process.env.WEB_PORT) || fixed.web || 6060;
const apiPort = Number(process.env.API_PORT) || fixed.api || 6061;
process.env.API_INTERNAL_URL ||= `http://localhost:${apiPort}`;
process.env.WEB_BASE_URL ||= `http://localhost:${webPort}`;

const args = process.argv.slice(2);
if (["dev", "start"].includes(args[0]) && !args.includes("-p") && !args.includes("--port")) args.push("-p", String(webPort));
process.argv = [process.argv[0], require.resolve("next/dist/bin/next"), ...args];
require("next/dist/bin/next");

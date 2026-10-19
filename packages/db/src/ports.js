// Local ports for the three apps, read from "ports" in the repo-root package.json.
// Change them there; an environment variable (API_PORT, RESOLVER_PORT, WEB_PORT) still wins, e.g. on a server.
const path = require("path");

const fixed = require(path.resolve(__dirname, "../../../package.json")).ports || {};
const num = (v, fallback) => Number(v) || fallback;

module.exports = {
  web: num(process.env.WEB_PORT, num(fixed.web, 6060)),
  api: num(process.env.API_PORT, num(fixed.api, 6061)),
  resolver: num(process.env.RESOLVER_PORT, num(fixed.resolver, 6062)),
};

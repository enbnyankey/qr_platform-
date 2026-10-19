// The single database client for the whole platform (API and resolver).
// Plain CommonJS so both apps can import it without a build step.
const path = require("path");
const dotenv = require("dotenv");

// Load the repo-root settings before the client is created, so every app gets the same DATABASE_URL.
// Values already in the environment win; .env wins over .env.local.
const root = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

const { PrismaClient, Prisma } = require("@prisma/client");

const g = globalThis;
const prisma =
  g.__qrPrisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });
// Reuse one client across hot reloads in development so we don't open a new pool each time.
if (process.env.NODE_ENV !== "production") g.__qrPrisma = prisma;

module.exports = { ...require("@prisma/client"), prisma, Prisma, PrismaClient };

module.exports.billing = require("./billing");
module.exports.ports = require("./ports");

import path from "path";
import dotenv from "dotenv";
import { ports } from "@qr/db";

// Load the repo-root .env (works from src/ under tsx and from dist/ after build).
// .env.local is also accepted; values in .env win if both exist.
const root = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required setting ${name}. Copy .env.example to .env in the project root and fill it in.`);
  }
  return v;
}

function databaseUrl(): string {
  const url = required("DATABASE_URL");
  try {
    const u = new URL(url);
    if (!u.pathname || u.pathname === "/") throw new Error("no database name");
    if (!/^\d*$/.test(u.port)) throw new Error("bad port");
  } catch {
    throw new Error(`DATABASE_URL looks wrong: expected postgres://USER:PASSWORD@HOST:PORT/DATABASE (check for a missing "/" before the database name).`);
  }
  return url;
}

const isTest = process.env.NODE_ENV === "test";

export const config = {
  env: process.env.NODE_ENV ?? "development",
  isTest,
  port: ports.api,
  databaseUrl: databaseUrl(),
  redisUrl: process.env.REDIS_URL || "",
  jwtSecret: required("JWT_SECRET", isTest ? "test-secret" : undefined),
  jwtTtl: "7d",
  qrBaseUrl: (process.env.QR_BASE_URL || `http://localhost:${ports.resolver}`).replace(/\/$/, ""),
  webBaseUrl: (process.env.WEB_BASE_URL || `http://localhost:${ports.web}`).replace(/\/$/, ""),
  // Public address of this API, used for payment provider webhooks (must be reachable from the internet in production).
  apiPublicUrl: (process.env.API_PUBLIC_URL || `http://localhost:${ports.api}`).replace(/\/$/, ""),
  uploadsDir: path.resolve(__dirname, "../uploads"),
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "QR Platform <no-reply@example.com>",
  },
  sms: {
    // "arkesel" or "hubtel"; anything else prints SMS to the console.
    provider: (process.env.SMS_PROVIDER || "").toLowerCase(),
    apiKey: process.env.SMS_API_KEY || "",
    clientId: process.env.SMS_CLIENT_ID || "",
    clientSecret: process.env.SMS_CLIENT_SECRET || "",
    senderId: process.env.SMS_SENDER_ID || "QRPlatform",
  },
  payments: {
    // The test checkout lets you try the full payment flow without real money. Off in production unless forced.
    testMode: process.env.PAYMENTS_TEST_MODE ? process.env.PAYMENTS_TEST_MODE === "true" : (process.env.NODE_ENV ?? "development") !== "production",
    paystack: { secretKey: process.env.PAYSTACK_SECRET_KEY || "" },
    hubtel: {
      apiId: process.env.HUBTEL_API_ID || "",
      apiKey: process.env.HUBTEL_API_KEY || "",
      merchantAccount: process.env.HUBTEL_MERCHANT_ACCOUNT || "",
    },
  },
  helpBot: {
    // Claude powers the in-app help assistant. Without a key it answers from the user guide by keyword search.
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.HELP_BOT_MODEL || "claude-haiku-5-5",
    messagesPerHour: Number(process.env.HELP_BOT_MESSAGES_PER_HOUR ?? 40),
  },
  otpTtlMinutes: 10,
  otpMaxAttempts: 5,
};

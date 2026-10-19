import nodemailer from "nodemailer";
import { config } from "../config";
import { logger } from "./logger";

/**
 * Notification provider adapters: email (SMTP) and SMS (Arkesel or Hubtel).
 * Without provider settings, messages are printed to the console, so local
 * development and sign-up never depend on a third party.
 */
const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

/** Last messages sent, kept in memory for tests. */
export const outbox: { channel: "email" | "sms"; to: string; subject: string; text: string }[] = [];

function remember(channel: "email" | "sms", to: string, subject: string, text: string) {
  outbox.push({ channel, to, subject, text });
  if (outbox.length > 50) outbox.shift();
}

function printToConsole(channel: string, to: string, subject: string, text: string) {
  if (!config.isTest) console.log(`\n[${channel === "sms" ? "sms" : "mail"}] to=${to}\n[${channel === "sms" ? "sms" : "mail"}] subject=${subject}\n${text}\n`);
}

export async function sendMail(to: string, subject: string, text: string) {
  remember("email", to, subject, text);
  if (!transport) return printToConsole("email", to, subject, text);
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, text });
  } catch (err) {
    // In development, a broken SMTP setup shouldn't block sign-up: show the message in the console instead.
    if (config.env === "production") throw err;
    logger.warn({ err: (err as Error).message }, "SMTP send failed; printing the message instead");
    printToConsole("email", to, subject, text);
  }
}

/** Ghana-friendly normalisation: 024 000 0000 → 233240000000. Other numbers must include a country code. */
export function normalizePhone(raw: string, defaultCountryCode = "233") {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return defaultCountryCode + digits.slice(1);
  return digits;
}

export async function sendSms(rawTo: string, text: string) {
  const to = normalizePhone(rawTo);
  remember("sms", to, "SMS", text);
  const { provider, apiKey, clientId, clientSecret, senderId } = config.sms;
  try {
    if (provider === "arkesel" && apiKey) {
      const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ sender: senderId, message: text, recipients: [to] }),
      });
      if (!res.ok) throw new Error(`Arkesel responded ${res.status}`);
      return;
    }
    if (provider === "hubtel" && clientId && clientSecret) {
      const url = new URL("https://smsc.hubtel.com/v1/messages/send");
      url.search = new URLSearchParams({ clientid: clientId, clientsecret: clientSecret, from: senderId, to, content: text }).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Hubtel responded ${res.status}`);
      return;
    }
    printToConsole("sms", to, "SMS", text);
  } catch (err) {
    // SMS is a second channel next to email, so a failure is logged, not fatal.
    logger.warn({ err: (err as Error).message, to }, "SMS send failed");
    printToConsole("sms", to, "SMS", text);
  }
}

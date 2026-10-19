import fs from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import sharp from "sharp";
import { config } from "../../config";
import type { QrStyle } from "./destinations";

/** Resolves an /uploads/... path to a file inside the uploads folder (never outside it). */
async function readUpload(uploadPath: string): Promise<Buffer | null> {
  const rel = uploadPath.replace(/^\/uploads\//, "");
  const full = path.resolve(config.uploadsDir, rel);
  if (!full.startsWith(path.resolve(config.uploadsDir) + path.sep)) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

/** Logo on a rounded plate in the background colour, so it reads cleanly over the modules. */
async function logoPlate(style: QrStyle, width: number): Promise<Buffer | null> {
  if (!style.logo) return null;
  const file = await readUpload(style.logo.path);
  if (!file) return null;
  const plate = Math.round((width * style.logo.size) / 100);
  const pad = Math.round(plate * 0.12);
  const logo = await sharp(file).resize(plate - pad * 2, plate - pad * 2, { fit: "contain", background: style.bg }).png().toBuffer();
  const r = Math.round(plate * 0.18);
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${plate}" height="${plate}"><rect width="100%" height="100%" rx="${r}" fill="${style.bg}"/></svg>`);
  return sharp(bg).composite([{ input: logo, top: pad, left: pad }]).png().toBuffer();
}

export async function renderPng(text: string, style: QrStyle, width: number): Promise<Buffer> {
  const base = await QRCode.toBuffer(text, { type: "png", errorCorrectionLevel: style.ecc, margin: style.margin, color: { dark: style.fg, light: style.bg }, width });
  const plate = await logoPlate(style, width);
  if (!plate) return base;
  const { width: w = width } = await sharp(base).metadata();
  const size = (await sharp(plate).metadata()).width ?? 0;
  const offset = Math.round((w - size) / 2);
  return sharp(base).composite([{ input: plate, top: offset, left: offset }]).png().toBuffer();
}

export async function renderSvg(text: string, style: QrStyle): Promise<string> {
  const svg = await QRCode.toString(text, { type: "svg", errorCorrectionLevel: style.ecc, margin: style.margin, color: { dark: style.fg, light: style.bg } });
  if (!style.logo) return svg;
  const file = await readUpload(style.logo.path);
  if (!file) return svg;
  const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1] ?? 0);
  if (!n) return svg;
  const plate = (n * style.logo.size) / 100;
  const pad = plate * 0.12;
  const x = (n - plate) / 2;
  const png = await sharp(file).resize(512, 512, { fit: "contain", background: style.bg }).png().toBuffer();
  const overlay =
    `<rect x="${x}" y="${x}" width="${plate}" height="${plate}" rx="${plate * 0.18}" fill="${style.bg}"/>` +
    `<image x="${x + pad}" y="${x + pad}" width="${plate - pad * 2}" height="${plate - pad * 2}" href="data:image/png;base64,${png.toString("base64")}"/>`;
  return svg.replace("</svg>", `${overlay}</svg>`);
}

"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ImagePlus, Lock, X } from "lucide-react";
import { promptUpgrade } from "@/lib/billing";
import { assetUrl, uploadFile } from "@/lib/api";
import { QrStyle } from "@/lib/qr-types";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Same composition as the server: logo on a rounded plate in the background colour, centred. */
async function renderPreview(value: string, style: QrStyle, width: number) {
  const ecc = style.logo ? "H" : style.ecc;
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, value, { errorCorrectionLevel: ecc, margin: style.margin, color: { dark: style.fg, light: style.bg }, width });
  if (style.logo) {
    const logo = await loadImage(assetUrl(style.logo.path)!);
    const ctx = canvas.getContext("2d")!;
    const plate = (canvas.width * style.logo.size) / 100;
    const pad = plate * 0.12;
    const x = (canvas.width - plate) / 2;
    ctx.fillStyle = style.bg;
    ctx.beginPath();
    ctx.roundRect(x, x, plate, plate, plate * 0.18);
    ctx.fill();
    const inner = plate - pad * 2;
    const scale = Math.min(inner / logo.width, inner / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.drawImage(logo, x + pad + (inner - w) / 2, x + pad + (inner - h) / 2, w, h);
  }
  return canvas.toDataURL("image/png");
}

/** Client-side render of a QR for live preview while designing (before it's saved). */
export function QrPreview({ value, style, size = 240, className }: { value: string; style: QrStyle; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    renderPreview(value, style, size * 2)
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [value, style.fg, style.bg, style.margin, style.ecc, style.logo?.path, style.logo?.size, size]);

  return (
    <div className={className} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="QR code preview" width={size} height={size} className="rounded-md" /> : <div className="size-full rounded-md bg-sunk" />}
    </div>
  );
}

function LogoControl({ orgId, style, onChange, locked }: { orgId: string; style: QrStyle; onChange: (s: QrStyle) => void; locked?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (locked && !style.logo) {
    return (
      <div className="grid gap-2">
        <span className="text-[13px] font-medium">Logo in the centre</span>
        <button
          type="button"
          onClick={() => promptUpgrade("Adding your logo to QR codes is included in the Basic and Pro plans.")}
          className="flex items-center gap-3 rounded-md border border-dashed border-line p-3 text-left text-sm text-muted hover:border-accent hover:text-accent"
        >
          <Lock className="size-4 shrink-0" /> Available on Basic and Pro. Upgrade to add your logo.
        </button>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-medium">Logo in the centre</span>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="grid size-14 place-items-center overflow-hidden rounded-md border border-dashed border-line bg-sunk text-muted hover:border-accent hover:text-accent"
          aria-label={style.logo ? "Replace logo" : "Add logo"}
        >
          {style.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(style.logo.path)} alt="" className="size-full object-contain p-1" />
          ) : uploading ? (
            <span className="text-[10px]">Uploading…</span>
          ) : (
            <ImagePlus className="size-5" />
          )}
        </button>
        {style.logo ? (
          <div className="grid min-w-40 flex-1 gap-1">
            <label htmlFor="logo-size" className="text-[13px] text-muted">
              Size: {style.logo.size}% of the code
            </label>
            <input id="logo-size" type="range" min={10} max={25} value={style.logo.size} onChange={(e) => onChange({ ...style, logo: { ...style.logo!, size: Number(e.target.value) } })} className="accent-[var(--color-accent)]" />
            <button type="button" className="flex w-fit items-center gap-1 text-xs text-muted hover:text-bad" onClick={() => onChange({ ...style, logo: null })}>
              <X className="size-3" /> Remove logo
            </button>
          </div>
        ) : (
          <p className="max-w-64 text-[13px] text-muted">Optional. A square PNG with a transparent or plain background works best.</p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setUploading(true);
            setError(null);
            try {
              const { path } = await uploadFile(orgId, f);
              onChange({ ...style, ecc: "H", logo: { path, size: style.logo?.size ?? 20 } });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed.");
            } finally {
              setUploading(false);
              e.target.value = "";
            }
          }}
        />
      </div>
      {error && <p className="text-[13px] text-bad">{error}</p>}
      {style.logo && <p className="text-[13px] text-muted">Damage tolerance is set to 30% automatically so the code still scans with the logo covering part of it.</p>}
    </div>
  );
}

export function StyleControls({ style, onChange, orgId, logoLocked }: { style: QrStyle; onChange: (s: QrStyle) => void; orgId?: string; logoLocked?: boolean }) {
  const PRESETS: [string, string][] = [
    ["#111111", "#ffffff"],
    ["#0d6b5c", "#ffffff"],
    ["#1d3a8a", "#ffffff"],
    ["#7a1f12", "#fff8f0"],
    ["#14201b", "#e9f3ee"],
  ];
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="text-[13px] font-medium">Colours</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(([fg, bg]) => (
            <button
              key={fg + bg}
              type="button"
              aria-label={`Code ${fg} on ${bg}`}
              aria-pressed={style.fg === fg && style.bg === bg}
              onClick={() => onChange({ ...style, fg, bg })}
              className={`grid size-9 place-items-center rounded-md border-2 ${style.fg === fg && style.bg === bg ? "border-accent" : "border-line"}`}
              style={{ background: bg }}
            >
              <span className="size-4 rounded-sm" style={{ background: fg }} />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="color" value={style.fg} onChange={(e) => onChange({ ...style, fg: e.target.value })} className="size-8 cursor-pointer rounded border border-line" />
            Code
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="color" value={style.bg} onChange={(e) => onChange({ ...style, bg: e.target.value })} className="size-8 cursor-pointer rounded border border-line" />
            Background
          </label>
        </div>
      </div>
      {orgId && <LogoControl orgId={orgId} style={style} onChange={onChange} locked={logoLocked} />}
      <div className="grid gap-2">
        <label htmlFor="s-margin" className="text-[13px] font-medium">
          Quiet zone: {style.margin} modules
        </label>
        <input id="s-margin" type="range" min={0} max={8} value={style.margin} onChange={(e) => onChange({ ...style, margin: Number(e.target.value) })} className="accent-[var(--color-accent)]" />
        <p className="text-[13px] text-muted">The blank border around the code. Keep at least 2 unless your design adds its own.</p>
      </div>
      <div className="grid gap-2">
        <span className="text-[13px] font-medium">Damage tolerance</span>
        <div className="grid grid-cols-4 gap-1 rounded-md border border-line p-1">
          {(["L", "M", "Q", "H"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={style.ecc === l}
              disabled={!!style.logo && l !== "H"}
              onClick={() => onChange({ ...style, ecc: l })}
              className={`rounded px-2 py-1.5 text-sm disabled:opacity-40 ${style.ecc === l ? "bg-accent text-white" : "hover:bg-sunk"}`}
            >
              {{ L: "7%", M: "15%", Q: "25%", H: "30%" }[l]}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted">How much of the code can be scratched or covered and still scan. Use 25–30% for outdoor prints or table stickers.</p>
      </div>
    </div>
  );
}

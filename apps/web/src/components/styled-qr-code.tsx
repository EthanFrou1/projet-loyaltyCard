"use client";

/**
 * StyledQRCode — QR code avec logo/icône centré et espace blanc autour.
 *
 * Technique pour l'espace blanc :
 *   - imageSettings pointe vers un carré blanc SVG (pour créer la zone
 *     excavée PLUS LARGE que le logo) → les modules QR s'écartent
 *   - Le logo réel est affiché par-dessus en CSS overlay, plus petit que
 *     la zone excavée → crée l'espace blanc visible entre logo et modules
 *
 * Avantage : pas de CORS (l'<img> CSS ne souffre pas des restrictions
 * CORS des opérations canvas), fonctionne avec les URLs R2.
 *
 * Comportement :
 *   logoUrl fourni  → logo de l'établissement centré avec espace blanc
 *   logoUrl absent  → icône Lucide du type (data URL SVG, espace intégré)
 */

import { QRCodeSVG } from "qrcode.react";
import { useMemo } from "react";

// Carré blanc minimal pour creuser la zone excavée sans afficher quoi que ce soit
const WHITE_SQUARE_DATA_URL = `data:image/svg+xml;base64,${btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="white" width="1" height="1"/></svg>'
)}`;

// Paths SVG Lucide (viewBox 0 0 24 24) pour chaque type d'établissement
const ICON_PATHS: Record<string, string> = {
  salon_coiffure: `
    <circle cx="6" cy="6" r="3"/>
    <circle cx="6" cy="18" r="3"/>
    <line x1="20" x2="8.12" y1="4" y2="15.88"/>
    <line x1="14.47" x2="20" y1="14.48" y2="20"/>
    <line x1="8.12" x2="12" y1="8.12" y2="12"/>`,
  barbier: `
    <circle cx="6" cy="6" r="3"/>
    <circle cx="6" cy="18" r="3"/>
    <line x1="20" x2="8.12" y1="4" y2="15.88"/>
    <line x1="14.47" x2="20" y1="14.48" y2="20"/>
    <line x1="8.12" x2="12" y1="8.12" y2="12"/>`,
  institut_beaute: `
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    <path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>`,
  spa: `
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>`,
  onglerie: `
    <path d="M6 3h12l4 6-10 13L2 9Z"/>
    <path d="M11 3 8 9l4 13 4-13-3-6"/>
    <path d="M2 9h20"/>`,
  restaurant: `
    <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/>
    <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.9.9 2.5.9 3.4 0l1-1c.9-.9.9-2.5 0-3.4z"/>
    <path d="m9 3 1.8 1.8"/><path d="M14 20.6 13 22"/>`,
  cafe: `
    <path d="M17 8h1a4 4 0 1 1 0 8h-1"/>
    <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
    <line x1="6" x2="6" y1="2" y2="4"/>
    <line x1="10" x2="10" y1="2" y2="4"/>
    <line x1="14" x2="14" y1="2" y2="4"/>`,
  boutique: `
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
    <line x1="3" x2="21" y1="6" y2="6"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>`,
  autre: `
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
};

/** Data URL SVG pour l'icône du type (fond blanc + marge intégrée) */
function buildIconDataUrl(type: string): string {
  const paths = ICON_PATHS[type] ?? ICON_PATHS.autre;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">`,
    `<rect width="100" height="100" fill="white"/>`,
    `<svg x="20" y="20" width="60" height="60" viewBox="0 0 24 24"`,
    ` fill="none" stroke="#111827" stroke-width="1.6"`,
    ` stroke-linecap="round" stroke-linejoin="round">`,
    paths,
    `</svg>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

interface StyledQRCodeProps {
  value: string;
  size?: number;
  establishmentType?: string | null;
  logoUrl?: string | null;
}

export function StyledQRCode({
  value,
  size = 160,
  establishmentType,
  logoUrl,
}: StyledQRCodeProps) {
  const iconDataUrl = useMemo(
    () => buildIconDataUrl(establishmentType ?? "autre"),
    [establishmentType]
  );

  // Zone excavée : 46 % du QR (inclut le logo + l'espace blanc autour)
  const excavateSize  = Math.round(size * 0.30);
  // Logo affiché : 38 % du QR → 4 % de marge blanche de chaque côté (inchangé)
  const logoDisplaySize = Math.round(size * 0.28);

  if (logoUrl) {
    // ── Cas logo : carré blanc pour excavation + logo en overlay CSS ──────────
    return (
      <div className="relative inline-block" style={{ width: size, height: size }}>
        <QRCodeSVG
          value={value}
          size={size}
          level="H"
          bgColor="#ffffff"
          fgColor="#111827"
          imageSettings={{
            src:      WHITE_SQUARE_DATA_URL,
            width:    excavateSize,
            height:   excavateSize,
            excavate: true,
          }}
        />
        {/* Logo centré par-dessus la zone excavée — pas de CORS car <img> CSS */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            width={logoDisplaySize}
            height={logoDisplaySize}
            style={{ objectFit: "contain", display: "block" }}
          />
        </div>
      </div>
    );
  }

  // ── Cas sans logo : icône SVG data URL (espace blanc intégré dans le SVG) ──
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="H"
      bgColor="#ffffff"
      fgColor="#111827"
      imageSettings={{
        src:      iconDataUrl,
        width:    excavateSize,
        height:   excavateSize,
        excavate: true,
      }}
    />
  );
}

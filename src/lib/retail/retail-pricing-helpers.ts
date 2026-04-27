import type { BidMaterialLine } from "@/types/bid";

export function normalizeRetailSkuDigits(raw: string | null | undefined): string | undefined {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 6 || d.length > 12) return undefined;
  return d;
}

/** Numbered name+notes for every line — fed to OpenAI so each Serp query stays line-specific and deduped. */
export function buildQuoteLinesSummaryForRetailAi(allLines: BidMaterialLine[]): string {
  return allLines
    .filter((l) => l.name.trim())
    .map((l, i) => {
      const trade = l.trade && l.trade !== "general" ? `[${l.trade}] ` : "";
      const notes = (l.notes ?? "").trim().slice(0, 200);
      const lid = l.line_id?.trim();
      const idSuffix = lid ? ` | line_id:${lid.slice(0, 13)}` : "";
      return `${i + 1}. ${trade}${l.name.trim().slice(0, 130)}${
        notes ? ` | line notes: ${notes}` : ""
      }${idSuffix}`;
    })
    .join("\n")
    .slice(0, 8500);
}

/** US ZIP for SerpApi `delivery_zip` — 5 digits, optional ZIP+4 on input. */
export function normalizeUsZipForHd(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const five = s.match(/^(\d{5})(?:-\d{4})?$/);
  if (five) return five[1];
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 5) return digits.slice(0, 5);
  return undefined;
}

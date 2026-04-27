import { isAllowedHomedepotProductImageUrl } from "@/lib/integrations/serpapi-homedepot";
import { isAllowedLowesProductImageUrl } from "@/lib/integrations/serpapi-lowes";
import type { BidMaterialLine } from "@/types/bid";

/**
 * True when the line is a **new vanity cabinet assembly** (supply/install/replace), so the
 * mockup should show the **catalog vanity** (double / integrated top, etc.), not merely a finish
 * skin on the existing cabinet pixels.
 */
export function lineDescribesNewVanityCabinetAssembly(line: BidMaterialLine): boolean {
  const blob = `${line.name} ${line.notes ?? ""}`.toLowerCase();
  if (!/\bvanity\b|\bvanities\b/i.test(blob)) return false;
  /** Vanity *lighting* lines must never trigger cabinet replacement mode. */
  if (/\bvanity\s+light\b|\bvanity\s+lighting\b|\bbath\s+light\s+bar\b/i.test(blob)) return false;
  if (/\b(lavatory|bathroom)\s+faucet\b/i.test(blob) && !/\bvanity\s+cabinet\b|\bdouble\s+vanity\b|\bintegrated\b/i.test(blob)) {
    return false;
  }
  if (/\bplumbing\s+connections?\b/i.test(blob) && !/\bcabinet\b|\bdouble\s+vanity\b|\bintegrated\b/i.test(blob)) {
    return false;
  }
  if (/\b(refinish|reface|repaint|touch[\s-]?up)\b/i.test(blob)) return false;

  const namedCabinetProduct =
    /\b(vanity\s+cabinet|double\s+vanity|double\s+sink\s+vanity|vanity\s+with\s+integrated|cabinet\s+with\s+integrated|integrated\s+sinks?|integrated\s+sink|bathroom\s+vanity\s+cabinet)\b/i.test(
      blob,
    );
  const supplyInstallVanitySku =
    /\b(supply\s+(?:and|&)\s+install|supply\/install)\b/i.test(blob) &&
    /\bvanity\b/i.test(blob) &&
    /\b(cabinet|integrated\s+sinks?|integrated\s+sink|double\s+vanity)\b/i.test(blob);

  if (!namedCabinetProduct && !supplyInstallVanitySku) return false;

  return (
    /\b(supply\s+(?:and|&)\s+install|supply\/install|install\s+new|new\s+vanity|replace\s+(?:the\s+)?vanity|replacement\s+vanity|full\s+vanity|upgrade\s+(?:the\s+)?vanity)\b/i.test(
      blob,
    ) ||
    (/\bsupply\b/i.test(blob) && /\binstall\b/i.test(blob)) ||
    /\binstall\b/i.test(blob) ||
    /\breplace\b/i.test(blob)
  );
}

export function quoteHasNewVanityCabinetAssembly(lines: BidMaterialLine[]): boolean {
  return lines.some((l) => l.name.trim().length > 0 && lineDescribesNewVanityCabinetAssembly(l));
}

/**
 * Short directive appended to Vertex / vision reference labels so each catalog photo
 * is tied to the correct fixture (avoids applying a sconce or floor tile SKU onto the vanity).
 */
export function mockupFixtureZoneHint(line: BidMaterialLine): string {
  const blob = `${line.name} ${line.notes ?? ""} ${line.trade ?? ""}`.toLowerCase();

  if (lineDescribesNewVanityCabinetAssembly(line)) {
    return "ZONE: **New vanity cabinet assembly** — replace the existing vanity at the same wall with the catalog unit: match cabinet door/drawer rhythm, finish, countertop, integrated or dual-basin layout, and hardware from the reference. Photorealistically merge into the scene (no floating cutout). Same wall only — no second vanity in a corner. **Do not** move or resize toilet, tub/shower, glass enclosure, or drains to fit the catalog — work only inside the vanity zone shown. Do not apply this ref to tub, shower, toilet, or lighting.";
  }

  if (
    /\bplumbing\s+connections?\b|\brough[\s-]?in\b/i.test(blob) &&
    /\b(vanity|shower|tub)\b/i.test(blob) &&
    !/\bvanity\s+cabinet\b|\bcabinet\s+with\b/i.test(blob)
  ) {
    return "ZONE: Rough-in / supplies / connections only — not a finished vanity cabinet and not a second vanity in the scene.";
  }
  if (
    (/\blavatory\b.*\bfaucets?\b|\bfaucets?\b.*\blavatory\b|\bdeck[\s-]?mount\b|\bwidespread\b|\bcenterset\b/i.test(
      blob,
    ) &&
      !/\bvanity\s+cabinet\b|\bdouble\s+vanity\s+cabinet\b|\bcabinet\s+with\s+integrated\b/i.test(blob)) ||
    (/\bfaucets?\b/i.test(blob) && /\bvanity\s+run\b/i.test(blob) && !/\bvanity\s+cabinet\b/i.test(blob))
  ) {
    return "ZONE: Faucet / trim on the existing sink or deck in the photo only — never use this catalog as a full vanity cabinet and do not add a second vanity.";
  }
  if (/\bmedicine\s*cabinet\b|\bmirror\s*cabinet\b/i.test(blob)) {
    return "ZONE: Medicine cabinet / mirrored wall cabinet only — not the vanity sink cabinet.";
  }
  /** “Vanity light” / “vanity sconce” are lighting — match before plain “vanity” (cabinet). */
  if (
    /\b(sconce|pendant|chandelier|vanity\s*light|bath\s*light|ceiling\s*light|recessed\s*light|light\s*fixture)\b/i.test(
      blob,
    )
  ) {
    return "ZONE: The named lighting fixture — never use this catalog as the vanity cabinet look.";
  }
  if (/\bvanity\b|\bvanities\b|\bvan\s*sink\b/i.test(blob)) {
    return "ZONE: ONLY the existing vanity / sink cabinet already in the room photo (same wall position and footprint). Apply the reference across the **full vertical extent** of that cabinet in frame—countertop, backsplash edge (if any), **all** drawer and door fronts, end panels / gables, and **base down through the toe kick**—not only the sink deck or upper “counter strip.” Same door/drawer **positions** and counts; finishes and materials follow the catalog. Do not apply this ref to the tub, toilet, floor field, shower walls, sconces, or mirror unless the line name explicitly names those.";
  }
  if (/\bfloor\s*tile\b|\bflooring\b|\bporcelain\b.*\bfloor\b|\bfloor\b.*\btile\b/i.test(blob)) {
    return "ZONE: Floor only — do not use this finish on the vanity cabinet.";
  }
  if (
    /\b(shower|tub)\b.*\btile\b|\btile\b.*\b(shower|tub)\b|\bshower\s*wall\b|\bwet\s*wall\b|\bshower\s*surround\b|\bwall\s*tile\b.*\b(bath|shower|tub)\b/i.test(
      blob,
    )
  ) {
    return "ZONE: Tub/shower wall or wet-area tile field only — **finish on existing wet-area surfaces**; do **not** shift, shrink, widen, or recenter the shower/tub enclosure, curb, glass, or door to match the catalog. Not the vanity face.";
  }
  if (/\bbacksplash\b|\bwall\s*paint\b|\bpaint\b.*\bwall\b/i.test(blob)) {
    return "ZONE: Backsplash or wall paint field described by the line — do not restyle the vanity cabinet from this ref unless the line is the vanity/cabinet line.";
  }
  return "ZONE: Apply only where this line name matches a visible object in the room photo; do not swap one line’s catalog look onto a different fixture type (e.g. never put a lighting SKU on the vanity).";
}

/**
 * A line may contribute to the AI mockup only if it has a usable product image:
 * a contractor reference upload and/or a Home Depot listing image URL.
 */
export function lineHasMockupVisualReference(line: BidMaterialLine): boolean {
  const path = line.reference_storage_path?.trim();
  if (path) return true;
  const hd = line.hd_image_url?.trim();
  if (hd && isAllowedHomedepotProductImageUrl(hd)) return true;
  const lw = line.lw_image_url?.trim();
  return !!(lw && isAllowedLowesProductImageUrl(lw));
}

/**
 * Heuristic: this line is the kind of **product** that should default to mockup ON when a shelf
 * image attaches (bulk pricing fetch, shelf pick). Excludes paint, consumables, fees, labor-only,
 * and rough-in supplies that are not useful as labeled room-mockup references.
 */
export function lineIsAutoMockupCatalogCandidate(line: BidMaterialLine): boolean {
  const trade = String(line.trade ?? "general").toLowerCase();
  if (trade === "paint" || trade === "labor" || trade === "permits" || trade === "drywall") {
    return false;
  }

  const blob = `${line.name} ${line.notes ?? ""}`.toLowerCase();
  if (!blob.trim()) return true;

  if (
    /\b(permit|inspection\s+fee|haul[-\s]?off|dumpster|disposal\s+fee|trip\s+fee|mobilization)\b/i.test(
      blob,
    )
  ) {
    return false;
  }
  if (/\b(labor\s+only|hourly\s+labor|man[-\s]?hours?\b|labor\s+and\s+materials\s+only)\b/i.test(blob)) {
    return false;
  }

  if (
    /\b(grout|thinset|mortar\s+mix|mastic|construction\s+adhesive|silicone\s+caulk|caulk|sealant)\b/i.test(
      blob,
    )
  ) {
    return false;
  }
  if (/\b(joint\s+compound|drywall\s+mud|spackle|sandpaper|painters\s+tape|masking\s+tape)\b/i.test(blob)) {
    return false;
  }
  if (
    /\b(primer\b|interior\s+paint|ceiling\s+paint|wall\s+paint|latex\s+paint|eggshell|semi[\s-]?gloss|flat\s+paint)\b/i.test(
      blob,
    )
  ) {
    return false;
  }
  if (/\b(paint\s+gallon|gallon\s+paint|quart\s+of\s+paint|five[\s-]?gallon\s+pail)\b/i.test(blob)) {
    return false;
  }
  if (
    /\bpaint\b/i.test(blob) &&
    /\b(wall|ceiling|room|trim|baseboard|interior|exterior)\b/i.test(blob) &&
    !/\b(cabinet|vanity|furniture|door\s+slab|spray\s+kitchen)\b/i.test(blob)
  ) {
    return false;
  }

  if (/\b(self[\s-]?leveler|floor\s+patch|concrete\s+patch|vapor\s+barrier\s+only)\b/i.test(blob)) {
    return false;
  }
  if (/\b(wire\s+nuts?|romex|electrical\s+box\s+only|junction\s+box)\b/i.test(blob)) {
    return false;
  }
  if (/\b(pex\s+tubing|pvc\s+drain\s+pipe|wax\s+ring|supply\s+line\s+only|shutoff\s+valve\s+only)\b/i.test(blob)) {
    return false;
  }

  /** Shower/tub **trim** (valve trim, cartridges) — not a single mockup SKU like a door or vanity. */
  if (
    /\b(shower|tub)\s+trim\b/i.test(blob) &&
    !/\b(shower\s+pan|shower\s+base|tile\s+walls?|wall\s+tile|shower\s+door|enclosure|surround\s+panel|niche)\b/i.test(
      blob,
    )
  ) {
    return false;
  }
  if (/\btrim\s+and\s+fixtures\b/i.test(blob) && /\b(shower|tub)\b/i.test(blob) && !/\b(tile|pan|door|base)\b/i.test(blob)) {
    return false;
  }

  return true;
}

/** Default mockup toggle after retail image attach: has ref **and** is a visual-product line. */
export function lineShouldAutoEnableMockupInclude(line: BidMaterialLine): boolean {
  return lineHasMockupVisualReference(line) && lineIsAutoMockupCatalogCandidate(line);
}

/**
 * When both retailers are linked, mockup should follow the **same** shelf SKU that drives
 * `unit_cost_usd` (lowest shelf price), so the model is not shown two conflicting catalog images.
 */
export function preferredRetailCatalogImageUrl(line: BidMaterialLine): string | null {
  const hd = line.hd_image_url?.trim();
  const lw = line.lw_image_url?.trim();
  const hdOk = !!(hd && isAllowedHomedepotProductImageUrl(hd));
  const lwOk = !!(lw && isAllowedLowesProductImageUrl(lw));
  if (!hdOk && !lwOk) return null;
  if (hdOk && !lwOk) return hd!;
  if (!hdOk && lwOk) return lw!;
  const hp = line.hd_unit_price_usd;
  const lp = line.lw_unit_price_usd;
  const cost = line.unit_cost_usd;
  if (hp != null && lp != null && Number.isFinite(hp) && Number.isFinite(lp)) {
    if (cost != null && Number.isFinite(cost)) {
      if (Math.abs(hp - cost) < 0.02) return hd!;
      if (Math.abs(lp - cost) < 0.02) return lw!;
    }
    return hp <= lp ? hd! : lw!;
  }
  return hd! ?? lw!;
}

/**
 * Same “winning shelf” rule as the Pricing line editor: which retailer’s card is primary when both
 * Home Depot and Lowe’s links exist.
 */
export function winningRetailCatalogTabForLine(row: BidMaterialLine): "hd" | "lw" | null {
  const hdUrl = row.hd_product_url?.trim();
  const lwUrl = row.lw_product_url?.trim();
  if (!hdUrl && !lwUrl) return null;
  if (hdUrl && !lwUrl) return "hd";
  if (lwUrl && !hdUrl) return "lw";
  const hp = row.hd_unit_price_usd;
  const lp = row.lw_unit_price_usd;
  const hdOk = hp != null && Number.isFinite(hp);
  const lwOk = lp != null && Number.isFinite(lp);
  if (hdOk && lwOk) return lp < hp - 1e-6 ? "lw" : "hd";
  if (lwOk && !hdOk) return "lw";
  if (hdOk && !lwOk) return "hd";
  return "hd";
}

/** True when both retailers have allowlisted shelf JPEGs (mockup may need an explicit retailer choice). */
export function lineHasDualRetailShelfImagesForMockup(line: BidMaterialLine): boolean {
  const hd = line.hd_image_url?.trim();
  const lw = line.lw_image_url?.trim();
  return !!(
    hd &&
    isAllowedHomedepotProductImageUrl(hd) &&
    lw &&
    isAllowedLowesProductImageUrl(lw)
  );
}

/**
 * Which retailer’s shelf JPEG {@link catalogRetailImageUrlForMockup} will use when both sides have images.
 * Respects `mockup_shelf_retailer` when set; otherwise matches the pricing primary tab.
 */
export function effectiveMockupShelfRetailerForLine(line: BidMaterialLine): "hd" | "lw" | null {
  const hd = line.hd_image_url?.trim();
  const lw = line.lw_image_url?.trim();
  const hdOk = !!(hd && isAllowedHomedepotProductImageUrl(hd));
  const lwOk = !!(lw && isAllowedLowesProductImageUrl(lw));
  if (!hdOk && !lwOk) return null;
  if (hdOk && !lwOk) return "hd";
  if (!hdOk && lwOk) return "lw";
  const p = line.mockup_shelf_retailer;
  if (p === "hd" && hdOk) return "hd";
  if (p === "lw" && lwOk) return "lw";
  return winningRetailCatalogTabForLine(line) ?? "hd";
}

/** Retail catalog JPEG used for mockup refs (explicit dual-retail choice or pricing-winner tab). */
export function catalogRetailImageUrlForMockup(line: BidMaterialLine): string | null {
  const hd = line.hd_image_url?.trim();
  const lw = line.lw_image_url?.trim();
  const hdOk = !!(hd && isAllowedHomedepotProductImageUrl(hd));
  const lwOk = !!(lw && isAllowedLowesProductImageUrl(lw));
  if (!hdOk && !lwOk) return null;
  if (hdOk && !lwOk) return hd!;
  if (!hdOk && lwOk) return lw!;
  const side = effectiveMockupShelfRetailerForLine(line);
  return side === "lw" ? lw! : hd!;
}

/** One quote line’s contribution to the global `[Mockup product ref N]` sequence (retail slot then contractor). */
export type MockupProductRefSlotEntry = {
  line: BidMaterialLine;
  /** 1-based indices matching `[Mockup product ref N]` on each labeled JPEG after the room photo. */
  refIndices: number[];
};

/**
 * Enumerates mockup JPEG slots in the same order as {@link collectMockupReferenceSignedUrls} in
 * `bids.ts` — used to align text prompts with multimodal ref labels (line ordinal ≠ ref index).
 */
export function enumerateMockupProductRefSlots(lines: BidMaterialLine[]): MockupProductRefSlotEntry[] {
  const filtered = lines.filter(
    (l) =>
      String(l.name ?? "").trim().length > 0 &&
      l.mockup_include !== false &&
      lineHasMockupVisualReference(l),
  );
  const ordered = sortQuoteLinesForMockupProductRefs(filtered);
  const out: MockupProductRefSlotEntry[] = [];
  let slot = 0;
  for (const line of ordered) {
    const refIndices: number[] = [];
    if (catalogRetailImageUrlForMockup(line)) {
      slot += 1;
      refIndices.push(slot);
    }
    if (line.reference_storage_path?.trim()) {
      slot += 1;
      refIndices.push(slot);
    }
    if (refIndices.length > 0) {
      out.push({ line, refIndices });
    }
  }
  return out;
}

export type MockupReferenceSlotPreview = {
  line_id?: string;
  lineName: string;
  kind: "retail" | "contractor";
  /** Home Depot / Lowe's for shelf pixels; null for contractor slot. */
  storeLabel: string | null;
  /** Catalog URL for retail slot (client can pass through retailImageUrlForLightbox). */
  shelfImageUrl: string | null;
};

/**
 * Slots the server will attach (same order as {@link collectMockupReferenceSignedUrls} in `bids.ts`).
 * Keep logic aligned when changing either.
 */
export function getMockupReferenceSlotPreviews(lines: BidMaterialLine[]): MockupReferenceSlotPreview[] {
  const out: MockupReferenceSlotPreview[] = [];
  for (const { line } of enumerateMockupProductRefSlots(lines)) {
    const lineName = String(line.name).trim();
    const retailUrl = catalogRetailImageUrlForMockup(line);
    if (retailUrl) {
      const hdTrim = line.hd_image_url?.trim();
      const isHd = Boolean(hdTrim && retailUrl === hdTrim);
      out.push({
        line_id: line.line_id,
        lineName,
        kind: "retail",
        storeLabel: isHd ? "Home Depot" : "Lowe's",
        shelfImageUrl: retailUrl,
      });
    }
    if (line.reference_storage_path?.trim()) {
      out.push({
        line_id: line.line_id,
        lineName,
        kind: "contractor",
        storeLabel: null,
        shelfImageUrl: null,
      });
    }
  }
  return out;
}

export function getMockupReferenceSlotSummaryStrings(lines: BidMaterialLine[]): string[] {
  return getMockupReferenceSlotPreviews(lines).map((p) =>
    p.kind === "retail"
      ? `${p.lineName} (${p.storeLabel ?? "Shelf"} image)`
      : `${p.lineName} (contractor photo)`,
  );
}

/** Vanity-ish line names that are on for mockup but have no usable shelf/contractor image (parsed or saved). */
export function vanityLinesMissingMockupVisual(lines: BidMaterialLine[]): BidMaterialLine[] {
  return lines.filter(
    (l) =>
      /\bvanity\b|\bvanities\b/i.test(String(l.name ?? "")) &&
      String(l.name ?? "").trim().length > 0 &&
      l.mockup_include !== false &&
      !lineHasMockupVisualReference(l),
  );
}

/**
 * Lower = earlier in mockup reference + quote-line order. Puts vanity/cabinet SKUs before lavatory
 * faucet trim so multimodal models still “see” the cabinet ref when the cap (e.g. 12) is tight.
 */
export function mockupProductRefSortPriority(line: BidMaterialLine): number {
  if (lineDescribesNewVanityCabinetAssembly(line)) return 0;
  const z = mockupFixtureZoneHint(line);
  if (z.includes("ONLY the existing vanity / sink cabinet")) return 1;
  if (line.trade === "cabinetry") return 2;
  const blob = `${line.name} ${line.notes ?? ""}`.toLowerCase();
  if (/\bvanity\b|\bvanities\b/i.test(blob) && !z.includes("Faucet / trim on the existing sink")) return 3;
  if (z.includes("Faucet / trim on the existing sink")) return 50;
  if (line.trade === "plumbing") return 45;
  return 25;
}

/** Stable reorder for `quoteForMockupImage` / Vertex ref JPEG order. */
export function sortQuoteLinesForMockupProductRefs(lines: BidMaterialLine[]): BidMaterialLine[] {
  const ord = new Map<BidMaterialLine, number>();
  lines.forEach((l, i) => ord.set(l, i));
  return [...lines].sort((a, b) => {
    const pa = mockupProductRefSortPriority(a);
    const pb = mockupProductRefSortPriority(b);
    if (pa !== pb) return pa - pb;
    return (ord.get(a) ?? 0) - (ord.get(b) ?? 0);
  });
}

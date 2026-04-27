export type BidStatus = "draft" | "sent" | "won" | "lost" | "archived";

export type BidPhotoKind = "before" | "after_mockup";

export type BidAiStatus = "idle" | "pending" | "complete" | "failed";

/** Rough trade / CSI bucket for estimate lines (electrical, plumbing, etc.). */
export type BidMaterialTrade =
  | "general"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "drywall"
  | "flooring"
  | "paint"
  | "cabinetry"
  | "tile"
  | "labor"
  | "permits"
  | "other";

export type BidMaterialLine = {
  /** Stable id for reference uploads and React keys (UUID). */
  line_id?: string;
  name: string;
  quantity: number;
  unit: string;
  /** Sell price per unit (customer-facing). */
  unit_price_usd: number;
  extended_usd: number;
  /** Estimated contractor cost per unit (before markup); optional. */
  unit_cost_usd?: number;
  /** Markup on cost, percent (e.g. 25 = 25%). Used with unit_cost to derive sell price. */
  markup_pct?: number;
  notes?: string;
  /** High-level trade for grouping (AI + manual). */
  trade?: BidMaterialTrade;
  /** Storage path in project-photos for optional product/finish reference image. */
  reference_storage_path?: string | null;
  /**
   * Optional Home Depot retail reference from search (SerpApi; verify in store).
   * Not an official Home Depot API — third-party search results.
   */
  hd_product_url?: string;
  hd_title?: string;
  hd_unit_price_usd?: number;
  hd_price_raw?: string;
  /** When SerpApi reports a prior shelf price (sale / Special Buy). */
  hd_price_was_usd?: number;
  /** e.g. 10 for 10% off — from SerpApi when available. */
  hd_percentage_off?: number;
  /** e.g. Special-Buy — from SerpApi when available. */
  hd_price_badge?: string;
  hd_product_id?: string;
  hd_fetched_at?: string;
  /** Product photo URL from SerpApi/Home Depot CDN (e.g. images.thdstatic.com) when available. */
  hd_image_url?: string;
  /**
   * Optional Lowe's retail reference (via SerpApi Google `site:lowes.com` search — verify on lowes.com).
   */
  lw_product_url?: string;
  lw_title?: string;
  lw_unit_price_usd?: number;
  lw_price_raw?: string;
  lw_price_was_usd?: number;
  lw_percentage_off?: number;
  lw_price_badge?: string;
  lw_product_id?: string;
  lw_fetched_at?: string;
  lw_image_url?: string;
  /**
   * When true, line may feed the mockup when it also has a visual ref (contractor photo and/or HD or Lowe's product image).
   * Set false to opt out. Saved values are clamped to refs on load/save.
   */
  mockup_include?: boolean;
  /**
   * When both Home Depot and Lowe’s have usable shelf images, which retailer’s JPEG is sent to the mockup.
   * Omitted = use the same primary shelf tab as pricing (lowest shelf unit price; tie → Home Depot).
   */
  mockup_shelf_retailer?: "hd" | "lw";
  /**
   * When true, the contractor reviewed and accepted this line’s pricing on the pricing step.
   * Cleared when pricing-related fields change. Omitted/false = pending review (styled in UI when priced).
   */
  pricing_approved?: boolean;
};

/** Saved line preset for a company (reusable across bids for that account). */
export type BidLineTemplate = {
  id: string;
  company_id: string;
  name: string;
  quantity: number;
  unit: string;
  trade?: BidMaterialTrade;
  notes?: string;
  /** Suggested unit price when inserting on the pricing step. */
  default_unit_price_usd: number;
  created_at: string;
};

export type RoomMeasurementRow = {
  id: string;
  label: string;
  length_ft: number;
  width_ft: number;
  ceiling_ft?: number;
  /** Optional — e.g. AI photo estimate caveats shown in scope and UI. */
  notes?: string;
  /** When true, show “add measurements” — AI could not size this from photos (no fake dimensions). */
  needs_user_measurements?: boolean;
};

/** One selectable choice for AI-generated walkthrough questions. */
export type ProjectQuestionOption = {
  option_id: string;
  label: string;
};

export type ProjectQuestionnaireItem = {
  question_id: string;
  question: string;
  /** Display / legacy free-text answer; for MCQ this should match the chosen option label. */
  answer: string;
  /** When set, this question is multiple-choice in the UI. */
  options?: ProjectQuestionOption[];
  selected_option_id?: string | null;
  /** When `allow_multiple` is true, the chosen option ids (single-select uses `selected_option_id` only). */
  selected_option_ids?: string[] | null;
  /** If true, the user may pick more than one option (checkboxes). */
  allow_multiple?: boolean;
  /** Free text when "Other" is selected (`selected_option_id` === `__other__`). */
  other_text?: string | null;
};

/** Shape returned by AI before the user selects answers (options required). */
export type ProjectQuestionDraft = {
  question_id: string;
  question: string;
  options: ProjectQuestionOption[];
  /** When true, UI uses multi-select checkboxes instead of a single choice. */
  allow_multiple?: boolean;
  /** When `zip_input`, UI shows a ZIP field instead of rendering `options` as MCQ. */
  ui_variant?: "zip_input";
};

export type Bid = {
  id: string;
  /** Owning Renovision account (required). */
  owner_id?: string;
  /** Optional legacy link to contractor company; homeowners use owner_id only. */
  company_id: string | null;
  /** Shared by all copies of the same quote (usually the original bid id). */
  quote_family_id: string;
  status: BidStatus;
  title: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  site_address_line1: string | null;
  site_city: string | null;
  site_state: string | null;
  site_postal_code: string | null;
  scope_description: string;
  internal_notes: string | null;
  project_kind: string;
  walkthrough_transcript: string;
  room_measurements: RoomMeasurementRow[];
  project_questionnaire: ProjectQuestionnaireItem[];
  walkthrough_completed_at: string | null;
  /** Optional uploaded plan / blueprint in storage. */
  blueprint_storage_path: string | null;
  material_estimate: BidMaterialLine[];
  ai_summary: string | null;
  ai_status: BidAiStatus;
  ai_last_error: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Stored on `after_mockup` rows: full prompt trail for admin / product tuning.
 */
export type BidMockupGenerationMeta = {
  additionalPrompt?: string | null;
  fullEditPrompt?: string;
  imageEditSource?: "before" | "latest_mockup";
  remodelEditPrompt?: string;
  roomAnalysis?: string | null;
  mockupOnly?: boolean;
  usedConceptFallback?: boolean;
  usedMockupProvider?: string;
  /** Same as caption’s “[Image model: …]” fragment for tooling / future UI. */
  image_model_caption?: string | null;
  /** Legacy: was set when OpenAI image edit ran after a Vertex failure (failover removed). */
  vertex_failover_reason?: string | null;
  referenceVisualSummary?: string | null;
  /** Mockup-enabled lines that had a shelf or contractor URL (same list sent to Vertex/OpenAI text). */
  mockup_reference_urls_count?: number;
  /** Human-readable slots (shelf + contractor) in send order — shown in caption / UI so contractors can verify vanity etc. */
  mockup_reference_slot_summaries?: string[];
  /** Vertex: inline images attached (`loaded` / `attempted`). */
  vertex_reference_fetch?: { attempted: number; loaded: number } | null;
  /** True when `MOCKUP_OMIT_INLINE_REFS_WEAK_ROOM=1` skipped attaching catalog pixels. */
  vertex_inline_product_refs_omitted_ambiguous_room?: boolean;
  /** OpenAI ran after Vertex auth error while `MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK=1`. */
  openai_after_vertex_auth_fallback?: boolean;
  /** Composite scope string used for this run. */
  scopeSnapshot?: string;
  regenerateFromRoom?: boolean;
  refineFromMockupPhotoId?: string | null;
  chosenRefineGeneration?: number | null;
};

export type BidPhoto = {
  id: string;
  bid_id: string;
  storage_path: string;
  sort_order: number;
  caption: string | null;
  kind: BidPhotoKind;
  /** For after_mockup: 1-based version (v1, v2, …). Null for before photos. */
  mockup_generation: number | null;
  /** For after_mockup: `openai` | `vertex_gemini` — which API produced this mockup (A/B). */
  mockup_image_provider?: string | null;
  /** For after_mockup: prompts and scope snapshot for this generation. */
  mockup_generation_meta?: BidMockupGenerationMeta | null;
  created_at: string;
};

export type BidPhotoWithUrl = BidPhoto & { signedUrl: string };

export type BidDetail = {
  bid: Bid;
  photos: BidPhotoWithUrl[];
  /** Signed URLs for line reference images, keyed by line_id. */
  lineReferenceUrls: Record<string, string>;
  /** Signed URL to view blueprint when uploaded. */
  blueprintSignedUrl: string | null;
};

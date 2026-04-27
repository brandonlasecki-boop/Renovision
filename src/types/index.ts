export type Company = {
  id: string;
  owner_id: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  brand_color: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  company_id: string;
  title: string;
  share_token: string;
  created_at: string;
  updated_at: string;
};

export type ProjectUpdate = {
  id: string;
  project_id: string;
  title: string;
  note: string;
  next_step: string;
  progress_percent: number;
  created_at: string;
};

export type ProjectPhoto = {
  id: string;
  project_id: string;
  storage_path: string;
  sort_order: number;
  caption: string | null;
  created_at: string;
};

/** Payload returned by get_public_project RPC */
export type PublicProjectPayload = {
  project: Pick<Project, "id" | "title" | "share_token" | "created_at">;
  company: Pick<
    Company,
    "id" | "name" | "tagline" | "logo_url" | "brand_color"
  >;
  updates: Pick<
    ProjectUpdate,
    | "id"
    | "title"
    | "note"
    | "next_step"
    | "progress_percent"
    | "created_at"
  >[];
  photos: Pick<
    ProjectPhoto,
    "id" | "storage_path" | "sort_order" | "caption" | "created_at"
  >[];
};

export type PublicPhotoView = {
  id: string;
  url: string;
  caption: string | null;
  sort_order: number;
};

export type {
  Bid,
  BidAiStatus,
  BidDetail,
  BidLineTemplate,
  BidMaterialLine,
  BidPhoto,
  BidPhotoKind,
  BidPhotoWithUrl,
  BidStatus,
} from "./bid";

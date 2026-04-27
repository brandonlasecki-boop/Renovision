import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

export type NormalizedImageBytes = {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

function fallbackContentType(mime: string): NormalizedImageBytes["contentType"] {
  const ct = mime.split(";")[0]?.trim().toLowerCase() || "";
  if (ct.includes("png")) return "image/png";
  if (ct.includes("webp")) return "image/webp";
  return "image/jpeg";
}

/**
 * Applies EXIF Orientation (and similar) so pixel data matches how viewers show the image.
 * Output is re-encoded without orientation metadata so downstream models are not confused.
 */
export async function normalizeImageBufferForDisplay(
  input: Buffer,
  fallbackMime = "image/jpeg",
): Promise<NormalizedImageBytes> {
  try {
    const pipeline = sharp(input, { failOn: "none" }).rotate();
    const meta = await pipeline.metadata();
    const fmt = meta.format;

    if (fmt === "png") {
      const buffer = await pipeline.png().toBuffer();
      return { buffer, contentType: "image/png" };
    }
    if (fmt === "webp") {
      const buffer = await pipeline.webp({ quality: 92 }).toBuffer();
      return { buffer, contentType: "image/webp" };
    }

    const buffer = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    return { buffer, contentType: "image/jpeg" };
  } catch (err) {
    console.warn("[normalize-image-exif] sharp failed, using original bytes:", err);
    return { buffer: input, contentType: fallbackContentType(fallbackMime) };
  }
}

/** Download from Supabase Storage and return a data URL with EXIF orientation applied. */
export async function normalizedImageDataUrlFromStoragePath(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  fallbackMime = "image/jpeg",
): Promise<string | null> {
  const trimmed = path.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.storage.from(bucket).download(trimmed);
  if (error || !data) return null;
  const raw = Buffer.from(await data.arrayBuffer());
  const norm = await normalizeImageBufferForDisplay(raw, fallbackMime);
  return bufferToDataUrl(norm);
}

export function bufferToDataUrl(norm: NormalizedImageBytes): string {
  const b64 = norm.buffer.toString("base64");
  return `data:${norm.contentType};base64,${b64}`;
}

export function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const out = new ArrayBuffer(buf.length);
  new Uint8Array(out).set(buf);
  return out;
}

"use client";

/**
 * Hosted Next.js (e.g. Vercel) caps Server Action request bodies (~4.5MB). The Try flow allows larger
 * source files; we shrink in the browser when needed so the multipart POST stays under the platform limit.
 */
export const MAX_TRY_SERVER_ACTION_UPLOAD_BYTES = 4 * 1024 * 1024;

export function isLikelyHeicUpload(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return mime.includes("heic") || mime.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
}

/** JPEG re-encode + resize until under {@link MAX_TRY_SERVER_ACTION_UPLOAD_BYTES}. */
export async function compressTryPhotoForUpload(file: File): Promise<File> {
  if (file.size <= MAX_TRY_SERVER_ACTION_UPLOAD_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const origW = bitmap.width;
    const origH = bitmap.height;
    const baseName = file.name.replace(/\.[^.]+$/i, "") || "photo";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");

    let maxSide = 2560;
    for (let attempt = 0; attempt < 18; attempt++) {
      const scale = Math.min(1, maxSide / Math.max(origW, origH));
      const tw = Math.max(1, Math.round(origW * scale));
      const th = Math.max(1, Math.round(origH * scale));
      canvas.width = tw;
      canvas.height = th;
      ctx.drawImage(bitmap, 0, 0, tw, th);

      for (let q = 0.9; q >= 0.42; q -= 0.06) {
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), "image/jpeg", q),
        );
        if (blob && blob.size <= MAX_TRY_SERVER_ACTION_UPLOAD_BYTES) {
          return new File([blob], `${baseName}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
        }
      }
      maxSide = Math.floor(maxSide * 0.72);
      if (maxSide < 480) break;
    }

    canvas.width = 1024;
    canvas.height = Math.max(1, Math.round((origH / origW) * 1024));
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.4),
    );
    if (!blob) throw new Error("blob");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

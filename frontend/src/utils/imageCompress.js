/**
 * Client-side Canvas image compression for avatars & room pictures.
 * Resizes images to fit within maxSize x maxSize (preserving aspect ratio)
 * and encodes as WebP (with JPEG fallback) to drastically reduce upload size
 * and server storage without external dependencies.
 *
 * @param {File} file
 * @param {{ maxSize?: number, quality?: number }} [options]
 * @returns {Promise<File>}
 */
export async function compressImageFile(file, { maxSize = 512, quality = 0.82 } = {}) {
  if (!file || !file.type?.startsWith("image/")) return file;
  // Skip animated GIFs to avoid breaking animation frames
  if (file.type === "image/gif") return file;

  try {
    const objectUrl = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);

    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    if (!origW || !origH) return file;

    const scale = Math.min(1, maxSize / Math.max(origW, origH));
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const toBlob = (mime, q) =>
      new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), mime, q));

    // Prefer WebP for best compression; fallback to JPEG
    let blob = await toBlob("image/webp", quality);
    let outMime = "image/webp";
    let outExt = "webp";

    if (!blob || blob.type !== "image/webp") {
      blob = await toBlob("image/jpeg", quality);
      outMime = "image/jpeg";
      outExt = "jpg";
    }

    if (!blob) return file;

    // Only keep compressed version if it actually saves bytes or resized dimensions
    if (blob.size >= file.size && scale === 1) {
      return file;
    }

    const baseName = (file.name || "avatar").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.${outExt}`, {
      type: outMime,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

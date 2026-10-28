export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageType = {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  extension: "png" | "jpg" | "webp" | "gif";
};

export function detectImageType(buffer: Uint8Array): ImageType | null {
  if (buffer.length >= 8) {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (pngSignature.every((byte, index) => buffer[index] === byte)) {
      return { mimeType: "image/png", extension: "png" };
    }
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }

  if (buffer.length >= 6) {
    const head = String.fromCharCode(...buffer.slice(0, 6));
    if (head === "GIF87a" || head === "GIF89a") {
      return { mimeType: "image/gif", extension: "gif" };
    }
  }

  if (buffer.length >= 12) {
    const riff = String.fromCharCode(...buffer.slice(0, 4));
    const webp = String.fromCharCode(...buffer.slice(8, 12));
    if (riff === "RIFF" && webp === "WEBP") {
      return { mimeType: "image/webp", extension: "webp" };
    }
  }

  return null;
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "image";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "image";
}

export function validateImage(
  buffer: Uint8Array,
  filename: string,
  altText: string,
): { ok: true; type: ImageType; filename: string } | { ok: false; error: string } {
  if (buffer.length === 0) {
    return { ok: false, error: "Choose an image file." };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Images must be 5 MB or smaller." };
  }

  const type = detectImageType(buffer);
  if (!type) {
    return {
      ok: false,
      error: "Images must be PNG, JPEG, WebP, or GIF.",
    };
  }

  const trimmedAlt = altText.trim();
  if (trimmedAlt.length === 0) {
    return { ok: false, error: "Describe the image for screen reader users." };
  }
  if (trimmedAlt.length > 200) {
    return { ok: false, error: "Image descriptions must be 200 characters or fewer." };
  }

  return {
    ok: true,
    type,
    filename: sanitizeFilename(filename || `image.${type.extension}`),
  };
}

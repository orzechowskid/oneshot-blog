import { describe, expect, it } from "vitest";
import {
  detectImageType,
  MAX_IMAGE_BYTES,
  sanitizeFilename,
  validateImage,
} from "./image";

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("detectImageType", () => {
  it("detects PNG", () => {
    expect(detectImageType(png)).toEqual({
      mimeType: "image/png",
      extension: "png",
    });
  });

  it("detects JPEG", () => {
    expect(detectImageType(jpeg)).toEqual({
      mimeType: "image/jpeg",
      extension: "jpg",
    });
  });

  it("detects GIF", () => {
    expect(detectImageType(gif)).toEqual({
      mimeType: "image/gif",
      extension: "gif",
    });
  });

  it("detects WebP", () => {
    expect(detectImageType(webp)).toEqual({
      mimeType: "image/webp",
      extension: "webp",
    });
  });

  it("rejects unknown bytes", () => {
    expect(detectImageType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

describe("validateImage", () => {
  it("accepts a valid image with alt text", () => {
    const result = validateImage(png, "photo.png", "A photo");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.type.mimeType).toBe("image/png");
      expect(result.filename).toBe("photo.png");
    }
  });

  it("rejects empty files", () => {
    expect(validateImage(new Uint8Array(), "empty.png", "A photo")).toEqual({
      ok: false,
      error: "Choose an image file.",
    });
  });

  it("rejects files above the size limit", () => {
    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1);
    expect(validateImage(oversized, "big.png", "A photo")).toEqual({
      ok: false,
      error: "Images must be 5 MB or smaller.",
    });
  });

  it("rejects unsupported formats", () => {
    expect(
      validateImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), "file.bin", "A file"),
    ).toEqual({
      ok: false,
      error: "Images must be PNG, JPEG, WebP, or GIF.",
    });
  });

  it("requires a non-empty description", () => {
    expect(validateImage(png, "photo.png", "  ")).toEqual({
      ok: false,
      error: "Describe the image for screen reader users.",
    });
  });

  it("limits the description length", () => {
    expect(validateImage(png, "photo.png", "a".repeat(201))).toEqual({
      ok: false,
      error: "Image descriptions must be 200 characters or fewer.",
    });
  });
});

describe("sanitizeFilename", () => {
  it("removes directory paths and unsafe characters", () => {
    expect(sanitizeFilename("../../My Photo!.png")).toBe("My-Photo-.png");
  });

  it("falls back to a generic name", () => {
    expect(sanitizeFilename("///")).toBe("image");
  });
});

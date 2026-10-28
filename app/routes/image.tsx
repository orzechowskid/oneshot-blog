import type { LoaderFunctionArgs } from "react-router";
import { getImage } from "../lib/posts.server";
import { sanitizeFilename } from "../lib/image";
import { isUuid } from "../lib/validation";

export async function loader({ params }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id || !isUuid(id)) {
    throw new Response("Not Found", { status: 404 });
  }

  const image = await getImage(id);
  if (!image) {
    throw new Response("Not Found", { status: 404 });
  }

  return new Response(new Uint8Array(image.data), {
    status: 200,
    headers: {
      "Content-Type": image.mime_type,
      "Content-Length": String(image.byte_size),
      "Content-Disposition": `inline; filename="${sanitizeFilename(image.filename)}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

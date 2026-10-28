import { ensureSchema, getPool } from "./db.server";
import { hashPassword } from "./password";
import { uniqueSlugCandidate } from "./slug";

export type PostStatus = "draft" | "published";

export type PostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  status: PostStatus;
  published_at: string | null;
  updated_at: string;
};

export type Post = PostSummary & {
  body_markdown: string;
  created_at: string;
};

export type PostImage = {
  id: string;
  post_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  alt_text: string;
  created_at: string;
};

export type StoredImage = PostImage & {
  data: Buffer;
};

export type PostInput = {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  published: boolean;
};

async function resolveSlug(base: string, excludeId?: string): Promise<string> {
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = uniqueSlugCandidate(base, attempt);
    const result = await getPool().query<{ id: string }>(
      "SELECT id FROM posts WHERE slug = $1",
      [candidate],
    );
    if (result.rows.length === 0 || result.rows[0]?.id === excludeId) {
      return candidate;
    }
  }
  throw new Error("Could not find an available slug.");
}

export async function listPublishedPosts(): Promise<PostSummary[]> {
  await ensureSchema();
  const result = await getPool().query<PostSummary>(
    `SELECT id, slug, title, excerpt, status, published_at, updated_at
     FROM posts
     WHERE status = 'published'
     ORDER BY published_at DESC NULLS LAST, created_at DESC`,
  );
  return result.rows;
}

export async function getPublishedPost(slug: string): Promise<Post | null> {
  await ensureSchema();
  const result = await getPool().query<Post>(
    `SELECT id, slug, title, excerpt, status, published_at, updated_at,
            body_markdown, created_at
     FROM posts
     WHERE slug = $1 AND status = 'published'`,
    [slug],
  );
  return result.rows[0] ?? null;
}

export async function listAllPosts(): Promise<PostSummary[]> {
  await ensureSchema();
  const result = await getPool().query<PostSummary>(
    `SELECT id, slug, title, excerpt, status, published_at, updated_at
     FROM posts
     ORDER BY updated_at DESC`,
  );
  return result.rows;
}

export async function getPost(id: string): Promise<Post | null> {
  await ensureSchema();
  const result = await getPool().query<Post>(
    `SELECT id, slug, title, excerpt, status, published_at, updated_at,
            body_markdown, created_at
     FROM posts
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function createPost(input: PostInput): Promise<Post> {
  await ensureSchema();
  const slug = await resolveSlug(input.slug);
  const result = await getPool().query<Post>(
    `INSERT INTO posts (slug, title, body_markdown, excerpt, status, published_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, slug, title, excerpt, status, published_at, updated_at,
               body_markdown, created_at`,
    [
      slug,
      input.title,
      input.body,
      input.excerpt,
      input.published ? "published" : "draft",
      input.published ? new Date() : null,
    ],
  );
  const post = result.rows[0];
  if (!post) throw new Error("Post insert failed.");
  return post;
}

export async function updatePost(id: string, input: PostInput): Promise<Post | null> {
  await ensureSchema();
  const slug = await resolveSlug(input.slug, id);
  const result = await getPool().query<Post>(
    `UPDATE posts
     SET slug = $1,
         title = $2,
         body_markdown = $3,
         excerpt = $4,
         status = $5,
         published_at = CASE
           WHEN $5 = 'published' THEN COALESCE(published_at, now())
           ELSE NULL
         END,
         updated_at = now()
     WHERE id = $6
     RETURNING id, slug, title, excerpt, status, published_at, updated_at,
               body_markdown, created_at`,
    [
      slug,
      input.title,
      input.body,
      input.excerpt,
      input.published ? "published" : "draft",
      id,
    ],
  );
  return result.rows[0] ?? null;
}

export async function deletePost(id: string): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query("DELETE FROM posts WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listImages(postId: string): Promise<PostImage[]> {
  await ensureSchema();
  const result = await getPool().query<PostImage>(
    `SELECT id, post_id, filename, mime_type, byte_size, alt_text, created_at
     FROM images
     WHERE post_id = $1
     ORDER BY created_at DESC`,
    [postId],
  );
  return result.rows;
}

export async function createImage(
  postId: string,
  filename: string,
  mimeType: string,
  altText: string,
  data: Uint8Array,
): Promise<PostImage> {
  await ensureSchema();
  const result = await getPool().query<PostImage>(
    `INSERT INTO images (post_id, filename, mime_type, byte_size, alt_text, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, post_id, filename, mime_type, byte_size, alt_text, created_at`,
    [postId, filename, mimeType, data.byteLength, altText.trim(), data],
  );
  const image = result.rows[0];
  if (!image) throw new Error("Image insert failed.");
  return image;
}

export async function getImage(id: string): Promise<StoredImage | null> {
  await ensureSchema();
  const result = await getPool().query<StoredImage>(
    `SELECT id, post_id, filename, mime_type, byte_size, alt_text, created_at, data
     FROM images
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function deleteImage(id: string, postId: string): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    "DELETE FROM images WHERE id = $1 AND post_id = $2",
    [id, postId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function countUsers(): Promise<number> {
  await ensureSchema();
  const result = await getPool().query<{ count: string }>(
    "SELECT count(*)::text AS count FROM users",
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function createOwner(email: string, password: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2)",
    [email.toLowerCase(), hashPassword(password)],
  );
}

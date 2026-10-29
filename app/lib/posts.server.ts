import { ensureSchema, getPool } from "./db.server";
import { hashPassword } from "./password";
import { uniqueSlugCandidate } from "./slug";
import type { FieldErrors } from "./validation";

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

// One row of the admin list: the published summary plus the draft-attachment
// data (draft_title presence and draft_updated_at) used to tell the three
// post states apart and to order by the post's last change.
export type AdminPostSummary = PostSummary & {
  draft_title: string | null;
  draft_updated_at: string | null;
};

export type Post = PostSummary & {
  body_markdown: string;
  created_at: string;
};

export type PostWithDraft = Post & {
  draft_title: string | null;
  draft_body_markdown: string | null;
  draft_excerpt: string | null;
  draft_updated_at: string | null;
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

export type DraftInput = {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
};

export type PostLifecycleResult =
  | {
      saved: true;
      id: string;
      slug: string;
      title: string;
      status: PostStatus;
      saved_at: string;
      fieldErrors?: FieldErrors;
    }
  | { saved: false; fieldErrors: FieldErrors };

const MAX_SLUG_ATTEMPTS = 50;

type SlugResolution =
  | { kind: "available"; slug: string }
  | { kind: "exhausted"; fieldErrors: FieldErrors };

async function resolveSlugResult(
  base: string,
  excludeId?: string,
): Promise<SlugResolution> {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = uniqueSlugCandidate(base, attempt);
    const result = await getPool().query<{ id: string }>(
      "SELECT id FROM posts WHERE slug = $1",
      [candidate],
    );
    if (result.rows.length === 0 || result.rows[0]?.id === excludeId) {
      return { kind: "available", slug: candidate };
    }
  }
  return {
    kind: "exhausted",
    fieldErrors: {
      slug: `Could not find an available address for '${base}'.`,
    },
  };
}

async function resolveSlug(base: string, excludeId?: string): Promise<string> {
  const resolution = await resolveSlugResult(base, excludeId);
  if (resolution.kind === "available") return resolution.slug;
  throw new Error("Could not find an available slug.");
}

type LifecycleRow = {
  id: string;
  slug: string;
  title: string;
  status: PostStatus;
  saved_at: string;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

type SlugWriteOutcome =
  | { ok: true; row: LifecycleRow | null; fieldErrors?: FieldErrors }
  | { ok: false; fieldErrors: FieldErrors };

async function writeWithSlugCollisionHandling(
  base: string,
  excludeId: string | undefined,
  write: (slug: string) => Promise<LifecycleRow | null>,
): Promise<SlugWriteOutcome> {
  let savedAfterConflict = false;
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const resolution = await resolveSlugResult(base, excludeId);
    if (resolution.kind === "exhausted") {
      return { ok: false, fieldErrors: resolution.fieldErrors };
    }
    try {
      const row = await write(resolution.slug);
      return {
        ok: true,
        row,
        fieldErrors: savedAfterConflict
          ? {
              slug: `The address '${base}' was taken by a concurrent save. The draft was saved under '${resolution.slug}'.`,
            }
          : undefined,
      };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The candidate was taken by a concurrent save. The next resolution
      // sees the conflicting row and returns the next suffixed candidate.
      savedAfterConflict = true;
    }
  }
  return {
    ok: false,
    fieldErrors: {
      slug: `Could not find an available address for '${base}'.`,
    },
  };
}

function toLifecycleResult(
  outcome: SlugWriteOutcome,
): PostLifecycleResult | null {
  if (!outcome.ok) return { saved: false, fieldErrors: outcome.fieldErrors };
  if (!outcome.row) return null;
  const { id, slug, title, status, saved_at } = outcome.row;
  return {
    saved: true,
    id,
    slug,
    title,
    status,
    saved_at,
    fieldErrors: outcome.fieldErrors,
  };
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

export async function listAllPosts(): Promise<AdminPostSummary[]> {
  await ensureSchema();
  const result = await getPool().query<AdminPostSummary>(
    `SELECT id, slug, title, excerpt, status, published_at, updated_at,
            draft_title, draft_updated_at
     FROM posts
     ORDER BY COALESCE(draft_updated_at, updated_at) DESC`,
  );
  return result.rows;
}

export async function getPost(id: string): Promise<PostWithDraft | null> {
  await ensureSchema();
  const result = await getPool().query<PostWithDraft>(
    `SELECT id, slug, title, excerpt, status, published_at, updated_at,
            body_markdown, created_at,
            draft_title, draft_body_markdown, draft_excerpt, draft_updated_at
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

export async function createDraft(
  input: DraftInput,
): Promise<PostLifecycleResult | null> {
  await ensureSchema();
  const outcome = await writeWithSlugCollisionHandling(
    input.slug,
    undefined,
    (slug) =>
      getPool()
        .query<LifecycleRow>(
          `INSERT INTO posts (slug, title, body_markdown, excerpt, status)
           VALUES ($1, $2, $3, $4, 'draft')
           RETURNING id, slug, title, status, updated_at AS saved_at`,
          [slug, input.title, input.body, input.excerpt],
        )
        .then((result) => result.rows[0] ?? null),
  );
  return toLifecycleResult(outcome);
}

export async function saveDraft(
  id: string,
  input: DraftInput,
): Promise<PostLifecycleResult | null> {
  await ensureSchema();
  const existing = await getPost(id);
  if (!existing) return null;

  if (existing.status === "published") {
    const result = await getPool().query<LifecycleRow>(
      `UPDATE posts
       SET draft_title = $1,
           draft_body_markdown = $2,
           draft_excerpt = $3,
           draft_updated_at = now()
       WHERE id = $4
       RETURNING id, slug, title, status, draft_updated_at AS saved_at`,
      [input.title, input.body, input.excerpt, id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      saved: true,
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      saved_at: row.saved_at,
    };
  }

  const outcome = await writeWithSlugCollisionHandling(input.slug, id, (slug) =>
    getPool()
      .query<LifecycleRow>(
        `UPDATE posts
         SET slug = $1,
             title = $2,
             body_markdown = $3,
             excerpt = $4,
             updated_at = now()
         WHERE id = $5
         RETURNING id, slug, title, status, updated_at AS saved_at`,
        [slug, input.title, input.body, input.excerpt, id],
      )
      .then((result) => result.rows[0] ?? null),
  );
  return toLifecycleResult(outcome);
}

export async function publishPost(
  id: string,
): Promise<PostLifecycleResult | null> {
  await ensureSchema();
  const existing = await getPost(id);
  if (!existing) return null;

  if (existing.status === "draft") {
    const result = await getPool().query<LifecycleRow>(
      `UPDATE posts
       SET status = 'published',
           published_at = COALESCE(published_at, now()),
           updated_at = now(),
           draft_title = NULL,
           draft_body_markdown = NULL,
           draft_excerpt = NULL,
           draft_updated_at = NULL
       WHERE id = $1
       RETURNING id, slug, title, status, updated_at AS saved_at`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      saved: true,
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      saved_at: row.saved_at,
    };
  }

  const result = await getPool().query<LifecycleRow>(
    `UPDATE posts
     SET title = draft_title,
         body_markdown = draft_body_markdown,
         excerpt = draft_excerpt,
         status = 'published',
         published_at = COALESCE(published_at, now()),
         updated_at = now(),
         draft_title = NULL,
         draft_body_markdown = NULL,
         draft_excerpt = NULL,
         draft_updated_at = NULL
     WHERE id = $1 AND draft_title IS NOT NULL
     RETURNING id, slug, title, status, updated_at AS saved_at`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    saved: true,
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    saved_at: row.saved_at,
  };
}

export async function discardDraft(
  id: string,
): Promise<PostLifecycleResult | null> {
  await ensureSchema();
  const result = await getPool().query<LifecycleRow>(
    `UPDATE posts
     SET draft_title = NULL,
         draft_body_markdown = NULL,
         draft_excerpt = NULL,
         draft_updated_at = NULL
     WHERE id = $1 AND status = 'published'
     RETURNING id, slug, title, status, updated_at AS saved_at`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    saved: true,
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    saved_at: row.saved_at,
  };
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

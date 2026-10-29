import {
  data,
  Form,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { Link } from "react-aria-components";
import { Button } from "../components/Button";
import { PostForm } from "../components/PostForm";
import { requireUser } from "../lib/auth.server";
import { assertSameOrigin } from "../lib/csrf.server";
import { validateImage } from "../lib/image";
import { markdownImageSnippet, renderMarkdown } from "../lib/markdown";
import {
  createImage,
  deleteImage,
  deletePost,
  discardDraft,
  getPost,
  listImages,
  publishPost,
  saveDraft,
} from "../lib/posts.server";
import {
  isUuid,
  readPostForm,
  validateDraftSave,
  validatePublish,
} from "../lib/validation";
import styles from "./editor.module.css";

function notFound(): never {
  throw new Response("Not Found", { status: 404 });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);

  const id = params.id;
  if (!id || !isUuid(id)) notFound();

  const post = await getPost(id);
  if (!post) notFound();

  // With a draft attached the editor edits the draft: its title, body,
  // and excerpt replace the published values, and its save time is the
  // last change of the post. The initial preview is rendered on the
  // server with the same call the public post route uses (post.tsx:17).
  const hasDraft = post.draft_title !== null;
  const body = hasDraft ? post.draft_body_markdown ?? "" : post.body_markdown;
  const values = {
    title: hasDraft ? post.draft_title ?? "" : post.title,
    slug: post.slug,
    body,
    excerpt: hasDraft ? post.draft_excerpt ?? "" : post.excerpt,
  };

  const url = new URL(request.url);
  return {
    post,
    values,
    initialPreviewHtml: renderMarkdown(body),
    isPublished: post.status === "published",
    hasDraft,
    draftUpdatedAt: post.draft_updated_at,
    images: await listImages(id),
    saved: url.searchParams.get("saved") === "1",
    imageUploaded: url.searchParams.get("imageUploaded") === "1",
    publishError: url.searchParams.get("publishError"),
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  assertSameOrigin(request);

  const id = params.id;
  if (!id || !isUuid(id)) notFound();

  const post = await getPost(id);
  if (!post) notFound();

  const formData = await request.formData();
  // No default: a missing intent is the error at the end of this action,
  // not the removed `update` intent.
  const intent = String(formData.get("intent") ?? "");

  if (intent === "delete") {
    await deletePost(id);
    return redirect("/admin");
  }

  if (intent === "delete-image") {
    const imageId = String(formData.get("imageId") ?? "");
    if (isUuid(imageId)) {
      await deleteImage(imageId, id);
    }
    return redirect(`/admin/${id}/edit`);
  }

  if (intent === "upload-image") {
    const file = formData.get("image");
    const altText = String(formData.get("altText") ?? "");

    if (!(file instanceof File) || file.size === 0) {
      return data({ imageError: "Choose an image file." }, { status: 400 });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = validateImage(buffer, file.name, altText);
    if (!result.ok) {
      return data({ imageError: result.error }, { status: 400 });
    }

    await createImage(
      id,
      result.filename,
      result.type.mimeType,
      altText.trim(),
      buffer,
    );
    return redirect(`/admin/${id}/edit?imageUploaded=1`);
  }

  const values = readPostForm(formData);
  const isPublished = post.status === "published";
  const hasDraft = post.draft_title !== null;

  if (intent === "save-draft") {
    // For a published row the submitted address is ignored and the
    // stored slug is kept (D1).
    const errors = validateDraftSave(values, isPublished);
    if (Object.keys(errors).length > 0) {
      return data({ errors, values }, { status: 400 });
    }

    const result = await saveDraft(id, {
      title: values.title,
      slug: values.slug,
      body: values.body,
      excerpt: values.excerpt,
    });
    if (!result) notFound();
    if (!result.saved) {
      // The 50-attempt address cap: a field error, never a server error.
      return data(
        {
          errors: { form: "The draft was not saved.", ...result.fieldErrors },
          values,
        },
        { status: 400 },
      );
    }
    // A concurrent save may have moved the address to a suffixed one;
    // the redirect re-renders the loader and the editor shows the
    // stored address.
    return redirect(`/admin/${id}/edit?saved=1`);
  }

  if (intent === "publish") {
    if (isPublished && !hasDraft) {
      // A published row with no attached draft has nothing to publish.
      // The disabled control in the UI is not the only guard (D6).
      const message =
        "The post is already published and has no draft to publish.";
      if ((request.headers.get("sec-fetch-mode") ?? "") === "navigate") {
        return redirect(
          `/admin/${id}/edit?publishError=${encodeURIComponent(message)}`,
        );
      }
      return Response.json({ error: message }, { status: 409 });
    }

    const errors = validatePublish(values, isPublished);
    if (Object.keys(errors).length > 0) {
      return data({ errors, values }, { status: 400 });
    }

    // publishPost keeps the stored address on both branches; the
    // address never changes on publish (D1).
    const result = await publishPost(id);
    if (!result) notFound();
    return redirect(`/admin/${id}/edit?saved=1`);
  }

  if (intent === "discard-draft") {
    const result = await discardDraft(id);
    if (!result) notFound();
    return redirect(`/admin/${id}/edit?saved=1`);
  }

  // No plain submit and no default branch: a mutation with no intent
  // performs no write. The editor is returned with an error naming the
  // missing action.
  return data(
    {
      errors: {
        form: "Choose an action: save a draft, publish, or discard the draft.",
      },
      values,
    },
    { status: 400 },
  );
}

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  {
    title: loaderData?.post
      ? `Edit ${loaderData.post.title} | Admin`
      : "Edit post | Admin",
  },
];

export default function AdminEditRoute() {
  const {
    post,
    values: loaderValues,
    initialPreviewHtml,
    isPublished,
    hasDraft,
    images,
    saved,
    imageUploaded,
    publishError,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const values =
    actionData && "values" in actionData ? actionData.values : loaderValues;
  const errors =
    actionData && "errors" in actionData ? actionData.errors : {};
  const imageError =
    actionData && "imageError" in actionData ? actionData.imageError : undefined;

  // Changes when an accepted save, publish, or discard re-runs this loader;
  // stays put on a rejected submission (action data) and on autosaves
  // (fetches). The draft save time, or the row save time for a draft-only
  // post, is what tells two saves of the same state apart. PostForm
  // re-seeds its fields from the loader values when it changes.
  const revision = [
    post.id,
    post.status,
    hasDraft,
    post.draft_updated_at ?? post.updated_at,
  ].join("|");

  return (
    <section className={styles.page}>
      <h1>Edit post</h1>

      {saved ? <p className={styles.status}>Post saved.</p> : null}
      {imageUploaded ? <p className={styles.status}>Image uploaded.</p> : null}
      {publishError ? (
        <p className={styles.imageError} role="alert">
          {publishError}
        </p>
      ) : null}

      <PostForm
        action={`/admin/${post.id}/edit`}
        values={values}
        errors={errors}
        submitLabel="Save post"
        initialPreviewHtml={initialPreviewHtml}
        id={post.id}
        isPublished={isPublished}
        hasDraft={hasDraft}
        revision={revision}
      />

      <div className={styles.section}>
        <h2>Images</h2>

        <Form
          method="post"
          action={`/admin/${post.id}/edit`}
          encType="multipart/form-data"
          className={styles.uploadForm}
        >
          <input type="hidden" name="intent" value="upload-image" />

          <label htmlFor="image" className={styles.fileLabel}>
            Image file
          </label>
          <input
            id="image"
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className={styles.fileInput}
            required
          />

          <label htmlFor="altText" className={styles.altLabel}>
            Image description
          </label>
          <input
            id="altText"
            name="altText"
            type="text"
            maxLength={200}
            className={styles.altInput}
            required
          />

          {imageError ? (
            <p className={styles.imageError} role="alert">
              {imageError}
            </p>
          ) : null}

          <Button type="submit">Upload image</Button>
        </Form>

        {images.length === 0 ? (
          <p className={styles.emptyImages}>No images uploaded for this post.</p>
        ) : (
          <ul className={styles.imageGrid}>
            {images.map((image) => (
              <li key={image.id} className={styles.imageCard}>
                <img
                  src={`/images/${image.id}`}
                  alt={image.alt_text}
                  className={styles.imagePreview}
                />
                <p className={styles.imageAlt}>{image.alt_text}</p>
                <code className={styles.snippet}>
                  {markdownImageSnippet(image.id, image.alt_text)}
                </code>
                <Form method="post" action={`/admin/${post.id}/edit`}>
                  <input type="hidden" name="intent" value="delete-image" />
                  <input type="hidden" name="imageId" value={image.id} />
                  <Button type="submit" variant="danger">
                    Delete image
                  </Button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.section}>
        <h2>Post actions</h2>
        <div className={styles.actions}>
          {post.status === "published" ? (
            <Link href={`/posts/${post.slug}`}>View post</Link>
          ) : null}
        </div>

        <Form method="post" action={`/admin/${post.id}/edit`}>
          <input type="hidden" name="intent" value="delete" />
          <p id="delete-help" className={styles.deleteHelp}>
            This permanently deletes the post and its images.
          </p>
          <Button
            type="submit"
            variant="danger"
            aria-describedby="delete-help"
          >
            Delete post
          </Button>
        </Form>
      </div>
    </section>
  );
}

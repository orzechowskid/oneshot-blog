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
import { markdownImageSnippet } from "../lib/markdown";
import {
  createImage,
  deleteImage,
  deletePost,
  getPost,
  listImages,
  updatePost,
} from "../lib/posts.server";
import { isUuid, readPostForm, validatePost } from "../lib/validation";
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

  const url = new URL(request.url);
  return {
    post,
    images: await listImages(id),
    saved: url.searchParams.get("saved") === "1",
    imageUploaded: url.searchParams.get("imageUploaded") === "1",
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
  const intent = String(formData.get("intent") ?? "update");

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
  const errors = validatePost(values);
  if (Object.keys(errors).length > 0) {
    return data({ errors, values }, { status: 400 });
  }

  const updated = await updatePost(id, values);
  if (!updated) notFound();

  return redirect(`/admin/${id}/edit?saved=1`);
}

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  {
    title: loaderData?.post
      ? `Edit ${loaderData.post.title} | Admin`
      : "Edit post | Admin",
  },
];

export default function AdminEditRoute() {
  const { post, images, saved, imageUploaded } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const values =
    actionData && "values" in actionData
      ? actionData.values
      : {
          title: post.title,
          slug: post.slug,
          body: post.body_markdown,
          excerpt: post.excerpt,
          published: post.status === "published",
        };
  const errors =
    actionData && "errors" in actionData ? actionData.errors : {};
  const imageError =
    actionData && "imageError" in actionData ? actionData.imageError : undefined;

  return (
    <section className={styles.page}>
      <h1>Edit post</h1>

      {saved ? <p className={styles.status}>Post saved.</p> : null}
      {imageUploaded ? <p className={styles.status}>Image uploaded.</p> : null}

      <PostForm
        action={`/admin/${post.id}/edit`}
        values={values}
        errors={errors}
        submitLabel="Save post"
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

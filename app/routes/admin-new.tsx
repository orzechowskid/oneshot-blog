import { data, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, MetaFunction } from "react-router";
import { PostForm } from "../components/PostForm";
import { requireUser } from "../lib/auth.server";
import { assertSameOrigin } from "../lib/csrf.server";
import { renderMarkdown } from "../lib/markdown";
import { createDraft, createPost } from "../lib/posts.server";
import {
  readPostForm,
  validateDraftSave,
  validatePublish,
  type PostValues,
} from "../lib/validation";
import styles from "./editor.module.css";

const EMPTY_VALUES: PostValues = {
  title: "",
  slug: "",
  body: "",
  excerpt: "",
};

export async function loader() {
  // The new-post form holds an empty body. Render it with the same call
  // the public post route uses (post.tsx:17) so the editor's first paint
  // previews the form's saved content.
  return { initialPreviewHtml: renderMarkdown("") };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  assertSameOrigin(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const values = readPostForm(formData);

  if (intent === "save-draft") {
    const errors = validateDraftSave(values);
    if (Object.keys(errors).length > 0) {
      return data({ errors, values }, { status: 400 });
    }

    // A draft-only row: the create path of the draft lifecycle, with the
    // address through the all-row collision check (the same path the
    // autosave route uses for a request without a post id).
    const result = await createDraft({
      title: values.title,
      slug: values.slug,
      body: values.body,
      excerpt: values.excerpt,
    });
    if (!result || !result.saved) {
      // The 50-attempt address cap: a field error naming the address the
      // form held, never a server error.
      return data(
        {
          errors: {
            form: "The draft was not saved.",
            slug: `The address '${values.slug}' is taken.`,
          },
          values,
        },
        { status: 400 },
      );
    }
    // A concurrent save may have moved the address to a suffixed one; the
    // saved row carries it and the edit route shows it.
    return redirect(`/admin/${result.id}/edit?saved=1`);
  }

  if (intent === "publish") {
    const errors = validatePublish(values);
    if (Object.keys(errors).length > 0) {
      return data({ errors, values }, { status: 400 });
    }

    // The row is created already published and keeps the address the form
    // holds (with the numeric suffix on a collision, as before).
    const result = await createPost({
      title: values.title,
      slug: values.slug,
      body: values.body,
      excerpt: values.excerpt,
      published: true,
    });
    if (!result || !result.saved) {
      // The 50-attempt address cap: a field error naming the address the
      // form held, never a server error.
      return data(
        {
          errors: {
            form: "The post was not published.",
            slug: `The address '${values.slug}' is taken.`,
          },
          values,
        },
        { status: 400 },
      );
    }
    return redirect(`/admin/${result.id}/edit?saved=1`);
  }

  // No plain submit and no default branch: a mutation with no intent
  // performs no write. The editor is returned with an error naming the
  // missing action.
  return data(
    {
      errors: { form: "Choose an action: save a draft or publish." },
      values,
    },
    { status: 400 },
  );
}

export const meta: MetaFunction = () => [{ title: "New post | Admin" }];

export default function AdminNewRoute() {
  const { initialPreviewHtml } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <section className={styles.page}>
      <h1>New post</h1>
      <PostForm
        action="/admin/new"
        values={actionData?.values ?? EMPTY_VALUES}
        errors={actionData?.errors ?? {}}
        initialPreviewHtml={initialPreviewHtml}
      />
    </section>
  );
}

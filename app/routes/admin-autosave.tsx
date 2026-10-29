import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "../lib/auth.server";
import { assertSameOrigin } from "../lib/csrf.server";
import { createDraft, getPost, saveDraft } from "../lib/posts.server";
import { isUuid, readPostForm, validateDraftSave } from "../lib/validation";

const AUTOSAVE_MARKER = "1";
const SAVE_DRAFT_INTENT = "save-draft";

// Autosave endpoint for the Markdown editor. The client calls this route with
// a same-origin fetch, so every answer is a raw Response object: React Router
// 8 encodes framework action results as turbo-stream, and plain JSON reaches
// the client only when the action returns a raw Response (see seed.tsx).
// Status set: 200 success, 400 validation failure and origin rejection,
// 401 session expiry, 409 conflict.
export async function action({ request }: ActionFunctionArgs) {
  try {
    await requireUser(request);
  } catch (error) {
    // requireUser throws a redirect to /login when the session is absent.
    // A fetch client cannot follow that redirect, so answer 401 instead.
    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }
    throw error;
  }

  // The framework origin guard answers 400 before this action runs. This is
  // the second line of defence for requests that reach the action directly.
  assertSameOrigin(request);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const intent = String(formData.get("intent") ?? "");
  const autosave = String(formData.get("autosave") ?? "");

  if (!intent) {
    return Response.json(
      { error: "Missing action. Autosave sends intent 'save-draft'." },
      { status: 400 },
    );
  }
  if (intent !== SAVE_DRAFT_INTENT) {
    return Response.json(
      { error: "Autosave only accepts the save-draft action." },
      { status: 400 },
    );
  }
  if (autosave !== AUTOSAVE_MARKER) {
    // Explicit saves send no autosave field and keep the redirect behaviour
    // through the admin routes.
    return Response.json(
      { error: "Autosave only accepts autosave requests (autosave=1)." },
      { status: 400 },
    );
  }

  const id = String(formData.get("id") ?? "").trim();
  if (id && !isUuid(id)) {
    // posts.id is a uuid column; a malformed id would be a server error.
    return Response.json({ error: "Invalid post id." }, { status: 400 });
  }

  const values = readPostForm(formData);

  // A published row keeps its stored address (D1): the submitted address,
  // which the form reader derives from the title, is ignored and no address
  // error is shown.
  let targetIsPublished = false;
  if (id) {
    const existing = await getPost(id);
    if (!existing) {
      return Response.json({ error: "Post not found." }, { status: 409 });
    }
    targetIsPublished = existing.status === "published";
  }

  const fieldErrors = validateDraftSave(values, targetIsPublished);
  if (Object.keys(fieldErrors).length > 0) {
    return Response.json(
      { error: "The draft was not saved.", fieldErrors },
      { status: 400 },
    );
  }

  const input = {
    title: values.title,
    slug: values.slug,
    body: values.body,
    excerpt: values.excerpt,
  };
  const result = id ? await saveDraft(id, input) : await createDraft(input);

  if (!result) {
    return Response.json(
      { error: "The draft could not be saved." },
      { status: 409 },
    );
  }
  if (!result.saved) {
    if (result.fieldErrors.form) {
      // The status guard did not apply: the row was published, or
      // deleted, while the save was in flight. A conflict, like the
      // concurrent-save conflict below: the editor shows the error and
      // keeps the draft marked unsaved.
      return Response.json(
        { error: "The post changed elsewhere; reload and try again." },
        { status: 409 },
      );
    }
    // The 50-attempt collision cap: a field error naming the address the
    // form held, never a server error.
    return Response.json(
      {
        error: "The draft was not saved.",
        fieldErrors: { slug: `The address '${values.slug}' is taken.` },
      },
      { status: 400 },
    );
  }
  const saved = {
    id: result.id,
    slug: result.slug,
    title: result.title,
    status: result.status,
    saved_at: result.saved_at,
  };
  if (result.fieldErrors) {
    // A concurrent save took the address between the collision check and the
    // write. The draft was saved under the resulting suffixed address, which
    // the field error on the address names so the editor can show it.
    return Response.json({ ...saved, fieldErrors: result.fieldErrors }, { status: 409 });
  }
  return Response.json(saved);
}

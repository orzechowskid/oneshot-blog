import { Form, useNavigation } from "react-router";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button } from "./Button";
import { FormErrorSummary } from "./FormErrorSummary";
import { MarkdownEditor } from "./MarkdownEditor";
import fieldStyles from "./TextField.module.css";
import styles from "./PostForm.module.css";

const AUTOSAVE_IDLE_MS = 3000;
const AUTOSAVE_ROUTE = "/admin/autosave";

export type PostFormValues = {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
};

export type PostFormProps = {
  action: string;
  values: PostFormValues;
  errors: Record<string, string>;
  initialPreviewHtml?: string;
  id?: string;
  isPublished?: boolean;
  hasDraft?: boolean;
  // Revision of the loader result that produced `values`. It changes when
  // an accepted save, publish, or discard re-runs the route loader; the
  // form re-seeds its fields from `values` when it changes after an
  // explicit submission. Autosave is a fetch and never changes it.
  revision?: string;
};

// The fields app/routes/admin-autosave.tsx returns for a saved draft.
// `status` is "draft" or "published"; a saved draft on a published row
// means the draft is attached to it.
type AutosaveResponse = {
  error?: string;
  id?: string;
  slug?: string;
  title?: string;
  status?: string;
  saved_at?: string;
  fieldErrors?: Record<string, string>;
};

type SaveState = "saving" | "saved" | "unsaved" | "failed";

const SAVE_STATE_TEXT: Record<SaveState, string> = {
  saving: "Saving…",
  saved: "Saved",
  unsaved: "Unsaved changes",
  failed: "Failed to save",
};

export function PostForm({
  action,
  values,
  errors,
  initialPreviewHtml = "",
  id,
  isPublished = false,
  hasDraft = false,
  revision,
}: PostFormProps) {
  const titleId = useId();
  const slugId = useId();
  const excerptId = useId();

  const [title, setTitle] = useState(values.title);
  const [slug, setSlug] = useState(values.slug);
  const [body, setBody] = useState(values.body);
  const [excerpt, setExcerpt] = useState(values.excerpt);
  const [postId, setPostId] = useState<string | null>(id ?? null);
  // The form's current action. After the first save on a new post it points
  // at the edit route for the created row, so explicit saves keep the same
  // post instead of creating a second one.
  const [formAction, setFormAction] = useState(action);
  const [autosaveFieldErrors, setAutosaveFieldErrors] = useState<
    Record<string, string>
  >({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [autosaveInFlight, setAutosaveInFlight] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // The values of the last successful save; the form is dirty while any
  // field differs from these.
  const [savedValues, setSavedValues] = useState<PostFormValues>(values);
  // Set when an autosave stores a draft on a published row. The loader
  // values isPublished and hasDraft change only when an explicit
  // submission re-runs the loader; an autosave is a fetch and never does,
  // so the Publish and Discard draft controls read this flag until the
  // next explicit submission refreshes the loader values.
  const [draftAttached, setDraftAttached] = useState(false);
  // Set while the latest preview request has failed. The status region
  // then says the preview is not up to date and that saving refreshes it.
  // Cleared when the next body change schedules a fresh preview request;
  // re-set if that request fails too.
  const [previewStale, setPreviewStale] = useState(false);

  const initialIdRef = useRef<string | null>(id ?? null);
  const autosaveSeqRef = useRef(0);
  const latestRef = useRef({ title, slug, body, excerpt, id: postId });
  latestRef.current = { title, slug, body, excerpt, id: postId };

  const navigation = useNavigation();
  const explicitInFlight =
    navigation.state === "submitting" || navigation.state === "loading";
  const anySaveInFlight = autosaveInFlight || explicitInFlight;
  // Mirrors explicitInFlight for reads inside the autosave timer, where
  // the value captured in the timer's closure would be stale.
  const explicitInFlightRef = useRef(explicitInFlight);
  explicitInFlightRef.current = explicitInFlight;

  // Set while an explicit form submission is in flight. Autosave is a
  // fetch and never changes the navigation state, so only explicit
  // submissions set it.
  const explicitSubmitRef = useRef(false);
  const prevNavigationStateRef = useRef(navigation.state);
  // The revision of the loader result the fields were last seeded from.
  const lastSeededRevisionRef = useRef(revision);

  useEffect(() => {
    if (
      navigation.state === "submitting" &&
      prevNavigationStateRef.current === "idle"
    ) {
      explicitSubmitRef.current = true;
    }
    prevNavigationStateRef.current = navigation.state;
  }, [navigation.state]);

  // After an explicit submission the server accepts, the redirect re-runs
  // the loader and the route passes new values with a new revision.
  // Re-seed the fields from them, so the form shows what the server now
  // holds: the published content after a discarded draft, the promoted
  // content after a publish. A rejected submission returns action data
  // without re-running the loader, so the revision stays and the typed
  // values are kept. Autosave changes neither the values nor the revision,
  // so typing while a save is in flight is never reset.
  useEffect(() => {
    if (revision === undefined) return;
    if (revision === lastSeededRevisionRef.current) return;
    if (!explicitSubmitRef.current) return;
    lastSeededRevisionRef.current = revision;
    explicitSubmitRef.current = false;
    setTitle(values.title);
    setSlug(values.slug);
    setBody(values.body);
    setExcerpt(values.excerpt);
    setSavedValues(values);
    // The loader values are fresh again, so the autosave marker is stale.
    setDraftAttached(false);
  }, [revision, values]);

  const dirty =
    title !== savedValues.title ||
    slug !== savedValues.slug ||
    body !== savedValues.body ||
    excerpt !== savedValues.excerpt;

  // A draft is attached when the loader says so, or when an autosave
  // stored one on this published row since the loader last ran.
  const hasAttachedDraft = hasDraft || draftAttached;

  const shownErrors = { ...errors, ...autosaveFieldErrors };

  const saveState: SaveState = anySaveInFlight
    ? "saving"
    : saveFailed
      ? "failed"
      : dirty
        ? "unsaved"
        : "saved";

  // Warn before a reload or tab close would drop unsaved edits. In-app
  // navigation does not unload the page, so it is not guarded.
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const runAutosave = useCallback(async () => {
    const current = latestRef.current;
    if (!current.title.trim()) return;
    const seq = ++autosaveSeqRef.current;
    setAutosaveInFlight(true);
    setSaveError(null);
    try {
      // Field names follow app/routes/admin-autosave.tsx.
      const formData = new FormData();
      formData.append("intent", "save-draft");
      formData.append("autosave", "1");
      if (current.id) {
        formData.append("id", current.id);
      }
      formData.append("title", current.title);
      formData.append("slug", current.slug);
      formData.append("body", current.body);
      formData.append("excerpt", current.excerpt);

      const response = await fetch(AUTOSAVE_ROUTE, {
        method: "POST",
        body: formData,
      });
      // Apply only the newest response; ignore superseded ones.
      if (seq !== autosaveSeqRef.current) return;

      let data: AutosaveResponse = {};
      try {
        data = (await response.json()) as AutosaveResponse;
      } catch {
        // A non-JSON answer is treated as a failure below.
      }

      const applySavedIdentity = (returnedId: string, returnedSlug: string) => {
        setPostId(returnedId);
        setSlug(returnedSlug);
        setSavedValues({
          title: current.title,
          slug: returnedSlug,
          body: current.body,
          excerpt: current.excerpt,
        });
        setSaveFailed(false);
        setAutosaveFieldErrors({});
        if (data.status === "published") {
          // The save stored a draft on a published row: the Publish and
          // Discard draft controls read the marker until an explicit
          // submission re-runs the loader with fresh values.
          setDraftAttached(true);
        }
        if (initialIdRef.current === null) {
          // First save on a new post: a reload continues this post instead
          // of starting a second draft.
          setFormAction(`/admin/${returnedId}/edit`);
          window.history.replaceState(null, "", `/admin/${returnedId}/edit`);
        }
      };

      if (response.status === 200) {
        if (typeof data.id === "string" && data.id) {
          const returnedSlug =
            typeof data.slug === "string" && data.slug
              ? data.slug
              : current.slug;
          applySavedIdentity(data.id, returnedSlug);
        } else {
          setSaveFailed(true);
          setSaveError("The draft was not saved.");
        }
      } else if (response.status === 400) {
        // Validation failure: show the field messages and keep the draft
        // marked unsaved.
        setSaveFailed(false);
        setAutosaveFieldErrors(data.fieldErrors ?? {});
        setSaveError(data.error ?? null);
      } else if (response.status === 401) {
        setSaveFailed(true);
        setSaveError(data.error ?? "Not signed in.");
      } else if (response.status === 409) {
        if (typeof data.id === "string" && data.id) {
          // A concurrent save took the address: the draft was saved under
          // the resulting suffixed address, which the field error names.
          const returnedSlug =
            typeof data.slug === "string" && data.slug
              ? data.slug
              : current.slug;
          applySavedIdentity(data.id, returnedSlug);
          if (data.fieldErrors) {
            setAutosaveFieldErrors(data.fieldErrors);
          }
        } else {
          setSaveFailed(true);
          setSaveError(data.error ?? "The draft could not be saved.");
        }
      } else {
        setSaveFailed(true);
        setSaveError(data.error ?? "The draft was not saved.");
      }
    } catch {
      if (seq === autosaveSeqRef.current) {
        setSaveFailed(true);
        setSaveError("The draft was not saved.");
      }
    } finally {
      if (seq === autosaveSeqRef.current) {
        setAutosaveInFlight(false);
      }
    }
  }, []);

  // Autosave after three seconds with no further change, only while the form
  // is dirty and a title is present. Each change resets the timer. The
  // timer does not start or fire while an explicit submission is in
  // flight, so a pending autosave cannot race an explicit save for the
  // same row.
  useEffect(() => {
    const isDirty =
      title !== savedValues.title ||
      slug !== savedValues.slug ||
      body !== savedValues.body ||
      excerpt !== savedValues.excerpt;
    if (!isDirty) return;
    if (!title.trim()) return;
    if (explicitInFlight) return;
    const timer = window.setTimeout(() => {
      if (explicitInFlightRef.current) return;
      void runAutosave();
    }, AUTOSAVE_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [title, slug, body, excerpt, savedValues, explicitInFlight, runAutosave]);

  const clearFieldError = useCallback((field: string) => {
    setAutosaveFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
    clearFieldError("title");
  };

  const handleSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSlug(event.target.value);
    clearFieldError("slug");
  };

  const handlePreviewFailed = useCallback(() => {
    // The latest preview request failed. The preview shows the last
    // successful render, which is older than the body.
    setPreviewStale(true);
  }, []);

  const handleBodyChange = useCallback(
    (next: string) => {
      setBody(next);
      clearFieldError("body");
      // The new body schedules a fresh preview request, so the stale
      // preview note no longer applies. It is re-set if the new request
      // fails.
      setPreviewStale(false);
    },
    [clearFieldError],
  );

  const handleExcerptChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setExcerpt(event.target.value);
    clearFieldError("excerpt");
  };

  return (
    <Form method="post" action={formAction} className={styles.form}>
      <FormErrorSummary errors={shownErrors} />

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor={titleId}>
          Title
        </label>
        <input
          id={titleId}
          name="title"
          className={fieldStyles.input}
          value={title}
          onChange={handleTitleChange}
          aria-required="true"
          aria-invalid={shownErrors.title ? true : undefined}
        />
        {shownErrors.title ? (
          <p className={fieldStyles.error}>{shownErrors.title}</p>
        ) : null}
      </div>

      {isPublished ? (
        // A published post keeps its public address: the control is
        // read-only and carries no name, so it is not submitted.
        <div className={fieldStyles.field}>
          <label className={fieldStyles.label} htmlFor={slugId}>
            Slug
          </label>
          <input
            id={slugId}
            className={fieldStyles.input}
            defaultValue={values.slug}
            readOnly
          />
        </div>
      ) : (
        <div className={fieldStyles.field}>
          <label className={fieldStyles.label} htmlFor={slugId}>
            Slug
          </label>
          <input
            id={slugId}
            name="slug"
            className={fieldStyles.input}
            value={slug}
            onChange={handleSlugChange}
            aria-invalid={shownErrors.slug ? true : undefined}
          />
          <p className={fieldStyles.description}>
            Lowercase letters, numbers, and single hyphens. Leave empty to
            derive it from the title.
          </p>
          {shownErrors.slug ? (
            <p className={fieldStyles.error}>{shownErrors.slug}</p>
          ) : null}
        </div>
      )}

      <MarkdownEditor
        name="body"
        value={body}
        onBodyChange={handleBodyChange}
        initialPreviewHtml={initialPreviewHtml}
        label="Body"
        onPreviewFailed={handlePreviewFailed}
      />

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor={excerptId}>
          Excerpt
        </label>
        <textarea
          id={excerptId}
          name="excerpt"
          className={fieldStyles.textarea}
          value={excerpt}
          onChange={handleExcerptChange}
          aria-invalid={shownErrors.excerpt ? true : undefined}
        />
        <p className={fieldStyles.description}>
          Leave empty to generate an excerpt from the body.
        </p>
        {shownErrors.excerpt ? (
          <p className={fieldStyles.error}>{shownErrors.excerpt}</p>
        ) : null}
      </div>

      <p className={fieldStyles.description} role="status" aria-live="polite">
        {SAVE_STATE_TEXT[saveState]}
        {/* The note is withheld while a save has failed: the alert region
            already names that failure, and saving cannot refresh the
            preview while saves fail. */}
        {previewStale && saveState !== "failed"
          ? " Preview not up to date. Save to refresh the preview."
          : null}
      </p>

      {saveError ? (
        <p className={fieldStyles.error} role="alert">
          {saveError}
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button
          type="submit"
          name="intent"
          value="save-draft"
          isDisabled={anySaveInFlight}
        >
          Save draft
        </Button>
        <Button
          type="submit"
          name="intent"
          value="publish"
          isDisabled={anySaveInFlight || (isPublished && !hasAttachedDraft)}
        >
          Publish
        </Button>
        {isPublished && hasAttachedDraft ? (
          <Button
            type="submit"
            name="intent"
            value="discard-draft"
            variant="danger"
            isDisabled={anySaveInFlight}
          >
            Discard draft
          </Button>
        ) : null}
      </div>
    </Form>
  );
}

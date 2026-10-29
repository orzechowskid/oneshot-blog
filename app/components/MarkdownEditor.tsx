import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import styles from "./MarkdownEditor.module.css";

const PREVIEW_DEBOUNCE_MS = 250;

type FormatKind = "bold" | "italic" | "link" | "code";

type Format = {
  label: string;
  prefix: string;
  suffix: string;
};

const FORMATS: Record<FormatKind, Format> = {
  bold: { label: "Bold", prefix: "**", suffix: "**" },
  italic: { label: "Italic", prefix: "*", suffix: "*" },
  link: { label: "Link", prefix: "[", suffix: "](url)" },
  code: { label: "Inline code", prefix: "`", suffix: "`" },
};

const SHORTCUTS: Record<string, FormatKind> = {
  b: "bold",
  i: "italic",
  k: "link",
  e: "code",
};

type Tab = "edit" | "preview";

export type MarkdownEditorProps = {
  name: string;
  value: string;
  onBodyChange: (body: string) => void;
  initialPreviewHtml: string;
  label: string;
  disabled?: boolean;
  onPreviewFailed?: () => void;
};

export function MarkdownEditor({
  name,
  value,
  onBodyChange,
  initialPreviewHtml,
  label,
  disabled = false,
  onPreviewFailed,
}: MarkdownEditorProps) {
  const textareaId = useId();
  const [previewHtml, setPreviewHtml] = useState(initialPreviewHtml);
  const [tab, setTab] = useState<Tab>("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewTimerRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);
  const onPreviewFailedRef = useRef(onPreviewFailed);

  useEffect(() => {
    onPreviewFailedRef.current = onPreviewFailed;
  });

  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, []);

  const schedulePreview = useCallback((body: string) => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
    }
    const seq = ++requestSeqRef.current;
    previewTimerRef.current = window.setTimeout(async () => {
      previewTimerRef.current = null;
      try {
        const formData = new FormData();
        formData.append("text", body);
        const response = await fetch("/admin/preview", {
          method: "POST",
          body: formData,
        });
        // Apply only the newest response; ignore responses that arrive out of order.
        if (seq !== requestSeqRef.current) {
          return;
        }
        if (response.status === 401) {
          // Session expired: keep the last preview and report the failure.
          onPreviewFailedRef.current?.();
          return;
        }
        if (!response.ok) {
          onPreviewFailedRef.current?.();
          return;
        }
        const data = (await response.json()) as { html?: unknown };
        if (typeof data.html === "string") {
          setPreviewHtml(data.html);
        }
      } catch {
        if (seq === requestSeqRef.current) {
          onPreviewFailedRef.current?.();
        }
      }
    }, PREVIEW_DEBOUNCE_MS);
  }, []);

  const commitBody = useCallback(
    (next: string) => {
      onBodyChange(next);
      schedulePreview(next);
    },
    [onBodyChange, schedulePreview],
  );

  const applyFormat = useCallback(
    (kind: FormatKind) => {
      if (disabled) {
        return;
      }
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      const format = FORMATS[kind];
      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      const selected = value.slice(start, end);
      const next =
        value.slice(0, start) +
        format.prefix +
        selected +
        format.suffix +
        value.slice(end);
      const caret = start + format.prefix.length;
      commitBody(next);
      // The textarea is controlled, so re-apply the selection after the
      // parent re-renders with the new value.
      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(caret, caret + selected.length);
      });
    },
    [disabled, value, commitBody],
  );

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    commitBody(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    if (event.shiftKey || event.altKey) {
      return;
    }
    const kind = SHORTCUTS[event.key.toLowerCase()];
    if (!kind) {
      return;
    }
    event.preventDefault();
    applyFormat(kind);
  };

  return (
    <div className={styles.wrapper}>
      <label htmlFor={textareaId}>{label}</label>
      <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
        <button
          type="button"
          aria-label="Bold"
          onClick={() => applyFormat("bold")}
          disabled={disabled}
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic"
          onClick={() => applyFormat("italic")}
          disabled={disabled}
        >
          I
        </button>
        <button
          type="button"
          aria-label="Link"
          onClick={() => applyFormat("link")}
          disabled={disabled}
        >
          Link
        </button>
        <button
          type="button"
          aria-label="Inline code"
          onClick={() => applyFormat("code")}
          disabled={disabled}
        >
          `code`
        </button>
      </div>
      {/* The container class carries the active tab to the stylesheet of task
          4.2: wide screens show both areas side by side; narrow screens show
          the body while the edit tab is active (layoutWide) or the preview
          while the preview tab is active (layoutNarrow). */}
      <div className={tab === "edit" ? styles.layoutWide : styles.layoutNarrow}>
        <textarea
          id={textareaId}
          name={name}
          className={styles.bodyArea}
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <section
          className={styles.previewArea}
          aria-label="Markdown preview"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
      <button
        type="button"
        className={styles.tabEdit}
        aria-pressed={tab === "edit"}
        onClick={() => setTab("edit")}
      >
        Edit
      </button>
      <button
        type="button"
        className={styles.tabPreview}
        aria-pressed={tab === "preview"}
        onClick={() => setTab("preview")}
      >
        Preview
      </button>
    </div>
  );
}

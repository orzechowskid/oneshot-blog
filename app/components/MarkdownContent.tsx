import styles from "./MarkdownContent.module.css";

export function MarkdownContent({ html }: { html: string }) {
  return (
    <div
      className={styles.markdown}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

import styles from "./FormErrorSummary.module.css";

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  slug: "Slug",
  body: "Body",
  excerpt: "Excerpt",
  email: "Email",
  password: "Password",
  image: "Image",
  altText: "Image description",
  form: "The form",
};

export function FormErrorSummary({
  errors,
}: {
  errors: Record<string, string>;
}) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;

  return (
    <div className={styles.summary} role="alert">
      <h2>There is a problem</h2>
      <ul>
        {entries.map(([field, message]) => (
          <li key={field}>
            {FIELD_LABELS[field] ?? field}: {message}
          </li>
        ))}
      </ul>
    </div>
  );
}

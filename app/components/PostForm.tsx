import { Form } from "react-router";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { FormErrorSummary } from "./FormErrorSummary";
import { TextAreaField, TextField } from "./TextField";
import styles from "./PostForm.module.css";

export type PostFormValues = {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  published: boolean;
};

export type PostFormProps = {
  action: string;
  values: PostFormValues;
  errors: Record<string, string>;
  submitLabel: string;
};

export function PostForm({
  action,
  values,
  errors,
  submitLabel,
}: PostFormProps) {
  return (
    <Form method="post" action={action} className={styles.form}>
      <FormErrorSummary errors={errors} />

      <TextField
        label="Title"
        name="title"
        defaultValue={values.title}
        errorMessage={errors.title}
        required
      />

      <TextField
        label="Slug"
        name="slug"
        defaultValue={values.slug}
        description="Lowercase letters, numbers, and single hyphens. Leave empty to derive it from the title."
        errorMessage={errors.slug}
      />

      <TextAreaField
        label="Body"
        name="body"
        defaultValue={values.body}
        description="GitHub-Flavored Markdown. Use ![description](/images/ID) for uploaded images."
        errorMessage={errors.body}
        required
      />

      <TextAreaField
        label="Excerpt"
        name="excerpt"
        defaultValue={values.excerpt}
        description="Leave empty to generate an excerpt from the body."
        errorMessage={errors.excerpt}
      />

      <div className={styles.checkboxRow}>
        <Checkbox
          name="published"
          value="yes"
          defaultSelected={values.published}
        >
          Publish this post
        </Checkbox>
      </div>

      <div className={styles.actions}>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </Form>
  );
}

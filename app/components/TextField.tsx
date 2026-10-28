import {
  FieldError,
  Input,
  Label,
  Text,
  TextArea,
  TextField as AriaTextField,
} from "react-aria-components";
import styles from "./TextField.module.css";

export type AppTextFieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  description?: string;
  errorMessage?: string;
  type?: "text" | "email" | "password" | "url" | "search";
  autoComplete?: string;
  required?: boolean;
};

export function TextField({
  label,
  name,
  defaultValue = "",
  description,
  errorMessage,
  type = "text",
  autoComplete,
  required = false,
}: AppTextFieldProps) {
  return (
    <AriaTextField
      className={styles.field}
      defaultValue={defaultValue}
      isInvalid={Boolean(errorMessage)}
      isRequired={required}
      validationBehavior="aria"
    >
      <Label className={styles.label}>{label}</Label>
      <Input
        className={styles.input}
        name={name}
        type={type}
        autoComplete={autoComplete}
      />
      {description ? (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      ) : null}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}

export type AppTextAreaFieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  description?: string;
  errorMessage?: string;
  required?: boolean;
};

export function TextAreaField({
  label,
  name,
  defaultValue = "",
  description,
  errorMessage,
  required = false,
}: AppTextAreaFieldProps) {
  return (
    <AriaTextField
      className={styles.field}
      defaultValue={defaultValue}
      isInvalid={Boolean(errorMessage)}
      isRequired={required}
      validationBehavior="aria"
    >
      <Label className={styles.label}>{label}</Label>
      <TextArea className={styles.textarea} name={name} />
      {description ? (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      ) : null}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}

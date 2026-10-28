import { Button as AriaButton, type ButtonProps } from "react-aria-components";
import styles from "./Button.module.css";

export type AppButtonProps = ButtonProps & {
  variant?: "primary" | "secondary" | "danger" | "link";
};

export function Button({
  variant = "primary",
  className,
  ...props
}: AppButtonProps) {
  const variantClass =
    variant === "secondary"
      ? styles.secondary
      : variant === "danger"
        ? styles.danger
        : variant === "link"
          ? styles.linkButton
          : "";

  const classes = [styles.button, variantClass, className]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");

  return <AriaButton className={classes} {...props} />;
}

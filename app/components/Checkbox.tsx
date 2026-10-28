import { Checkbox as AriaCheckbox } from "react-aria-components";
import styles from "./Checkbox.module.css";

export type AppCheckboxProps = {
  name: string;
  value?: string;
  defaultSelected?: boolean;
  children: React.ReactNode;
};

export function Checkbox({
  name,
  value,
  defaultSelected = false,
  children,
}: AppCheckboxProps) {
  return (
    <AriaCheckbox
      className={styles.checkbox}
      name={name}
      value={value}
      defaultSelected={defaultSelected}
    >
      {children}
    </AriaCheckbox>
  );
}

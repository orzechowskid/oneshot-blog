import type { MetaFunction } from "react-router";
import { Link } from "react-aria-components";
import styles from "./not-found.module.css";

export const meta: MetaFunction = () => [{ title: "Page not found" }];

export default function NotFoundRoute() {
  return (
    <section className={styles.page}>
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <p>
        <Link href="/">Return to the blog</Link>
      </p>
    </section>
  );
}

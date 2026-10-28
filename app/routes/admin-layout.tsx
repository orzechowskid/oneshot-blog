import { Outlet, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link } from "react-aria-components";
import { requireUser } from "../lib/auth.server";
import styles from "./admin.module.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  return { user };
}

export const meta: MetaFunction = () => [{ title: "Admin | One Shot Blog" }];

export default function AdminLayout() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <p>Signed in as {user.email}</p>
        <nav className={styles.nav} aria-label="Admin">
          <Link href="/admin" className={styles.navLink}>
            All posts
          </Link>
          <Link href="/admin/new" className={styles.navLink}>
            New post
          </Link>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}

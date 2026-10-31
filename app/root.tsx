import type { ReactNode } from "react";
import {
  Form,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
} from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link } from "react-aria-components";
import "./styles/global.css";
import { Button } from "./components/Button";
import { getOptionalUser } from "./lib/auth.server";
import styles from "./root.module.css";

export async function loader({ request }: LoaderFunctionArgs) {
  return { user: await getOptionalUser(request) };
}

export const meta: MetaFunction = () => [{ title: "One Shot Blog" }];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <>
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            One Shot Blog
          </Link>
          <nav className={styles.nav} aria-label="Main">
            {user ? (
              <>
                <Link href="/admin/new" className={styles.navLink}>
                  New post
                </Link>
                <Link href="/admin" className={styles.navLink}>
                  Admin
                </Link>
                <Form method="post" action="/logout" className={styles.logoutForm}>
                  <Button type="submit" variant="link">
                    Log out
                  </Button>
                </Form>
              </>
            ) : (
              <Link href="/login" className={styles.navLink}>
                Log in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <p>One Shot Blog</p>
      </footer>
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <section className={styles.errorPage}>
      <h1>{isNotFound ? "Page not found" : "Something went wrong"}</h1>
      <p>
        {isNotFound
          ? "The page you requested does not exist."
          : "The page could not be loaded. Try again later."}
      </p>
      <p>
        <a href="/">Return to the blog</a>
      </p>
    </section>
  );
}

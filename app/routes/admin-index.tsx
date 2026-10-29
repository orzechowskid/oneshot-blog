import { useLoaderData } from "react-router";
import type { MetaFunction } from "react-router";
import { Link } from "react-aria-components";
import { formatDate, toIsoString } from "../lib/format";
import { listAllPosts } from "../lib/posts.server";
import styles from "./admin.module.css";

export async function loader() {
  return { posts: await listAllPosts() };
}

export const meta: MetaFunction = () => [{ title: "Posts | Admin" }];

export default function AdminIndexRoute() {
  const { posts } = useLoaderData<typeof loader>();

  return (
    <section>
      <div className={styles.headerRow}>
        <h1>Posts</h1>
        <Link href="/admin/new" className={styles.navLink}>
          New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className={styles.empty}>No posts yet. Create the first one.</p>
      ) : (
        <table className={styles.table}>
          <caption>All posts</caption>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Status</th>
              <th scope="col">Last change</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const draftAttached = post.draft_title !== null;
              const lastChange =
                draftAttached && post.draft_updated_at !== null
                  ? post.draft_updated_at
                  : post.updated_at;
              return (
                <tr key={post.id}>
                  <td>{post.title}</td>
                  <td className={styles.status}>
                    {post.status === "draft"
                      ? "Draft"
                      : draftAttached
                        ? "Published with draft attached"
                        : "Published"}
                  </td>
                  <td>
                    <time dateTime={toIsoString(lastChange)}>
                      {formatDate(lastChange)}
                    </time>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <Link href={`/admin/${post.id}/edit`}>Edit</Link>
                      {post.status === "published" ? (
                        <Link href={`/posts/${post.slug}`}>View</Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

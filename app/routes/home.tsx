import { useLoaderData } from "react-router";
import type { MetaFunction } from "react-router";
import { PostCard } from "../components/PostCard";
import { listPublishedPosts } from "../lib/posts.server";
import styles from "./home.module.css";

export async function loader() {
  return { posts: await listPublishedPosts() };
}

export const meta: MetaFunction = () => [{ title: "One Shot Blog" }];

export default function HomeRoute() {
  const { posts } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      <h1>One Shot Blog</h1>
      <p className={styles.intro}>Short posts, written and published in one sitting.</p>

      {posts.length === 0 ? (
        <p className={styles.empty}>No posts have been published yet.</p>
      ) : (
        <ul className={styles.list}>
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

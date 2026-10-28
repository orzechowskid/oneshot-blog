import { Link } from "react-aria-components";
import { formatDate, toIsoString } from "../lib/format";
import type { PostSummary } from "../lib/posts.server";
import styles from "./PostCard.module.css";

export function PostCard({ post }: { post: PostSummary }) {
  return (
    <article className={styles.card}>
      <h2 className={styles.title}>
        <Link href={`/posts/${post.slug}`} className={styles.titleLink}>
          {post.title}
        </Link>
      </h2>
      <p className={styles.meta}>
        <time dateTime={toIsoString(post.published_at ?? post.updated_at)}>
          {formatDate(post.published_at ?? post.updated_at)}
        </time>
      </p>
      <p className={styles.excerpt}>{post.excerpt}</p>
    </article>
  );
}

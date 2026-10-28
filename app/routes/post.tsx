import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link } from "react-aria-components";
import { MarkdownContent } from "../components/MarkdownContent";
import { formatDate, toIsoString } from "../lib/format";
import { renderMarkdown } from "../lib/markdown";
import { getPublishedPost } from "../lib/posts.server";
import styles from "./post.module.css";

export async function loader({ params }: LoaderFunctionArgs) {
  const slug = params.slug;
  if (!slug) throw new Response("Not Found", { status: 404 });

  const post = await getPublishedPost(slug);
  if (!post) throw new Response("Not Found", { status: 404 });

  return { post, html: renderMarkdown(post.body_markdown) };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  {
    title: loaderData?.post
      ? `${loaderData.post.title} | One Shot Blog`
      : "One Shot Blog",
  },
  {
    name: "description",
    content: loaderData?.post?.excerpt ?? "",
  },
];

export default function PostRoute() {
  const { post, html } = useLoaderData<typeof loader>();

  return (
    <article className={styles.article}>
      <h1 className={styles.title}>{post.title}</h1>
      <p className={styles.meta}>
        <time dateTime={toIsoString(post.published_at ?? post.updated_at)}>
          {formatDate(post.published_at ?? post.updated_at)}
        </time>
      </p>
      <MarkdownContent html={html} />
      <p className={styles.back}>
        <Link href="/">Back to all posts</Link>
      </p>
    </article>
  );
}

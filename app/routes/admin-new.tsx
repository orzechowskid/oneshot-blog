import { data, redirect, useActionData } from "react-router";
import type { ActionFunctionArgs, MetaFunction } from "react-router";
import { PostForm } from "../components/PostForm";
import { requireUser } from "../lib/auth.server";
import { assertSameOrigin } from "../lib/csrf.server";
import { createPost } from "../lib/posts.server";
import { readPostForm, validatePost } from "../lib/validation";
import styles from "./editor.module.css";

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  assertSameOrigin(request);

  const formData = await request.formData();
  const values = readPostForm(formData);
  const errors = validatePost(values);
  if (Object.keys(errors).length > 0) {
    return data({ errors, values }, { status: 400 });
  }

  const post = await createPost(values);
  return redirect(`/admin/${post.id}/edit?saved=1`);
}

export const meta: MetaFunction = () => [{ title: "New post | Admin" }];

export default function AdminNewRoute() {
  const actionData = useActionData<typeof action>();

  return (
    <section className={styles.page}>
      <h1>New post</h1>
      <PostForm
        action="/admin/new"
        values={
          actionData?.values ?? {
            title: "",
            slug: "",
            body: "",
            excerpt: "",
            published: false,
          }
        }
        errors={actionData?.errors ?? {}}
        submitLabel="Create post"
      />
    </section>
  );
}

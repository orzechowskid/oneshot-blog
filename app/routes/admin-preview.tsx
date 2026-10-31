import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "../lib/auth.server";
import { assertSameOrigin } from "../lib/csrf.server";
import { renderMarkdown } from "../lib/markdown";

export async function action({ request }: ActionFunctionArgs) {
  try {
    await requireUser(request);
  } catch (error) {
    // requireUser throws a redirect to /login when the session is absent.
    // A fetch client cannot follow that redirect, so answer 401 instead.
    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }
    throw error;
  }

  assertSameOrigin(request);

  let text: string;
  try {
    const formData = await request.formData();
    const value = formData.get("text");
    if (typeof value !== "string") {
      return Response.json({ error: "Missing text." }, { status: 400 });
    }
    text = value;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  return Response.json({ html: renderMarkdown(text) });
}

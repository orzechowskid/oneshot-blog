import { redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { clearedSessionCookie, destroySession } from "../lib/auth.server";
import { assertSameOrigin } from "../lib/csrf.server";

export async function loader() {
  return redirect("/");
}

export async function action({ request }: ActionFunctionArgs) {
  assertSameOrigin(request);
  await destroySession(request);
  return redirect("/", {
    headers: { "Set-Cookie": clearedSessionCookie() },
  });
}

import type { ActionFunctionArgs } from "react-router";
import { safeEqualText } from "../lib/password";
import { countUsers, createOwner } from "../lib/posts.server";
import { validateEmail, validatePassword } from "../lib/validation";

export async function loader() {
  return new Response("Not Found", { status: 404 });
}

export async function action({ request }: ActionFunctionArgs) {
  const expectedToken = process.env.SEED_TOKEN;
  const providedToken = request.headers.get("x-seed-token") ?? "";

  if (!expectedToken || !safeEqualText(providedToken, expectedToken)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let email = "";
  let password = "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        email?: unknown;
        password?: unknown;
      };
      email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      password = typeof body.password === "string" ? body.password : "";
    } else {
      const formData = await request.formData();
      email = String(formData.get("email") ?? "").trim().toLowerCase();
      password = String(formData.get("password") ?? "");
    }
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const emailError = validateEmail(email);
  if (emailError) {
    return Response.json({ error: emailError }, { status: 400 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return Response.json({ error: passwordError }, { status: 400 });
  }

  if ((await countUsers()) > 0) {
    return Response.json({ error: "An owner account already exists." }, { status: 409 });
  }

  await createOwner(email, password);
  return Response.json({ ok: true });
}

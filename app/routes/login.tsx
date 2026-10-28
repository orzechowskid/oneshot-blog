import { data, Form, redirect, useActionData, useLoaderData } from "react-router";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { Button } from "../components/Button";
import { FormErrorSummary } from "../components/FormErrorSummary";
import { TextField } from "../components/TextField";
import {
  authenticate,
  createSession,
  getOptionalUser,
} from "../lib/auth.server";
import { assertSameOrigin } from "../lib/csrf.server";
import { safeRedirect } from "../lib/redirect";
import {
  readLoginForm,
  validateLogin,
  type LoginValues,
} from "../lib/validation";
import styles from "./login.module.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getOptionalUser(request);
  if (user) return redirect("/admin");

  const url = new URL(request.url);
  return {
    redirectTo: safeRedirect(url.searchParams.get("redirectTo"), "/admin"),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertSameOrigin(request);

  const formData = await request.formData();
  const values = readLoginForm(formData);
  const errors = validateLogin(values);
  if (Object.keys(errors).length > 0) {
    return data({ errors, values }, { status: 400 });
  }

  const user = await authenticate(values.email, values.password);
  if (!user) {
    return data(
      {
        errors: { form: "The email address or password is not correct." },
        values,
      },
      { status: 401 },
    );
  }

  const cookie = await createSession(user.id);
  const redirectTo = safeRedirect(formData.get("redirectTo")?.toString(), "/admin");
  return redirect(redirectTo, { headers: { "Set-Cookie": cookie } });
}

export const meta: MetaFunction = () => [{ title: "Log in | One Shot Blog" }];

export default function LoginRoute() {
  const { redirectTo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors: Record<string, string> = actionData?.errors ?? {};
  const values: LoginValues = actionData?.values ?? {
    email: "",
    password: "",
  };

  return (
    <section className={styles.page}>
      <h1>Log in</h1>
      <Form method="post" className={styles.form}>
        <FormErrorSummary errors={errors} />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={values.email}
          errorMessage={errors.email}
          required
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          defaultValue={values.password}
          errorMessage={errors.password}
          required
        />
        <div className={styles.actions}>
          <Button type="submit">Log in</Button>
        </div>
      </Form>
      <p className={styles.hint}>The owner account is created by the deploy script.</p>
    </section>
  );
}

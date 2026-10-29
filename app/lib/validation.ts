import { makeExcerpt } from "./excerpt";
import { slugify } from "./slug";

export type PostValues = {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  published: boolean;
};

export type LoginValues = {
  email: string;
  password: string;
};

export type FieldErrors = Record<string, string>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readPostForm(formData: FormData): PostValues {
  const title = String(formData.get("title") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const rawExcerpt = String(formData.get("excerpt") ?? "").trim();
  const published = formData.get("published") === "yes";

  return {
    title,
    slug: rawSlug ? slugify(rawSlug) : slugify(title),
    body,
    excerpt: rawExcerpt || makeExcerpt(body),
    published,
  };
}

// targetIsPublished is true when the target row is already published, in
// which case the submitted address is ignored and no address error is shown.
export function validateDraftSave(
  values: PostValues,
  targetIsPublished = false,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.title) {
    errors.title = "Enter a title.";
  } else if (values.title.length > 200) {
    errors.title = "Titles must be 200 characters or fewer.";
  }

  if (values.title && !targetIsPublished) {
    if (!values.slug) {
      errors.slug = "Enter a slug.";
    } else if (values.slug.length > 100) {
      errors.slug = "Slugs must be 100 characters or fewer.";
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) {
      errors.slug = "Use lowercase letters, numbers, and single hyphens.";
    }
  }

  // A draft save accepts an empty body; only the length limit applies.
  if (values.body.length > 100_000) {
    errors.body = "Post bodies must be 100,000 characters or fewer.";
  }

  if (values.excerpt.length > 400) {
    errors.excerpt = "Excerpts must be 400 characters or fewer.";
  }

  return errors;
}

export function validatePublish(
  values: PostValues,
  targetIsPublished = false,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.title) {
    errors.title = "Enter a title.";
  } else if (values.title.length > 200) {
    errors.title = "Titles must be 200 characters or fewer.";
  }

  if (values.title && !targetIsPublished) {
    if (!values.slug) {
      errors.slug = "Enter a slug.";
    } else if (values.slug.length > 100) {
      errors.slug = "Slugs must be 100 characters or fewer.";
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) {
      errors.slug = "Use lowercase letters, numbers, and single hyphens.";
    }
  }

  if (!values.body.trim()) {
    errors.body = "Write the post body in Markdown.";
  } else if (values.body.length > 100_000) {
    errors.body = "Post bodies must be 100,000 characters or fewer.";
  }

  if (values.excerpt.length > 400) {
    errors.excerpt = "Excerpts must be 400 characters or fewer.";
  }

  return errors;
}

export function readLoginForm(formData: FormData): LoginValues {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

export function validateLogin(values: LoginValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.email) {
    errors.email = "Enter your email address.";
  } else if (!EMAIL_PATTERN.test(values.email)) {
    errors.email = "Enter a valid email address.";
  }
  if (!values.password) {
    errors.password = "Enter your password.";
  }
  return errors;
}

export function validateEmail(email: string): string | null {
  if (!email) return "Enter an email address.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  if (email.length > 254) return "Email addresses must be 254 characters or fewer.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 12) {
    return "Use at least 12 characters for the owner password.";
  }
  if (password.length > 200) {
    return "Passwords must be 200 characters or fewer.";
  }
  return null;
}

export function validateAltText(altText: string): string | null {
  const trimmed = altText.trim();
  if (!trimmed) return "Describe the image for screen reader users.";
  if (trimmed.length > 200) return "Image descriptions must be 200 characters or fewer.";
  return null;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

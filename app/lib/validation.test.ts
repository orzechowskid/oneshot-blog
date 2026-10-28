import { describe, expect, it } from "vitest";
import {
  isUuid,
  readLoginForm,
  readPostForm,
  validateAltText,
  validateEmail,
  validateLogin,
  validatePassword,
  validatePost,
} from "./validation";

describe("readPostForm", () => {
  it("trims fields and derives the slug from the title", () => {
    const form = new FormData();
    form.set("title", "  Hello World  ");
    form.set("body", "Some text");
    form.set("published", "yes");

    expect(readPostForm(form)).toEqual({
      title: "Hello World",
      slug: "hello-world",
      body: "Some text",
      excerpt: "Some text",
      published: true,
    });
  });

  it("uses an explicit slug", () => {
    const form = new FormData();
    form.set("title", "Hello");
    form.set("slug", "My Custom Slug");
    form.set("body", "Text");
    expect(readPostForm(form).slug).toBe("my-custom-slug");
  });
});

describe("validatePost", () => {
  const valid = {
    title: "Hello",
    slug: "hello",
    body: "Some text",
    excerpt: "Some text",
    published: false,
  };

  it("accepts a valid post", () => {
    expect(validatePost(valid)).toEqual({});
  });

  it("requires a title", () => {
    expect(validatePost({ ...valid, title: "" }).title).toBe("Enter a title.");
  });

  it("rejects an invalid slug", () => {
    expect(validatePost({ ...valid, slug: "Hello World" }).slug).toBe(
      "Use lowercase letters, numbers, and single hyphens.",
    );
  });

  it("requires a body", () => {
    expect(validatePost({ ...valid, body: "  " }).body).toBe(
      "Write the post body in Markdown.",
    );
  });

  it("limits the excerpt length", () => {
    expect(validatePost({ ...valid, excerpt: "x".repeat(401) }).excerpt).toBe(
      "Excerpts must be 400 characters or fewer.",
    );
  });
});

describe("readLoginForm", () => {
  it("lowercases and trims the email", () => {
    const form = new FormData();
    form.set("email", " Owner@Example.com ");
    form.set("password", "secret");
    expect(readLoginForm(form)).toEqual({
      email: "owner@example.com",
      password: "secret",
    });
  });
});

describe("validateLogin", () => {
  it("accepts a valid login", () => {
    expect(
      validateLogin({ email: "owner@example.com", password: "secret" }),
    ).toEqual({});
  });

  it("requires an email", () => {
    expect(validateLogin({ email: "", password: "secret" }).email).toBe(
      "Enter your email address.",
    );
  });

  it("requires a valid email", () => {
    expect(validateLogin({ email: "not-an-email", password: "secret" }).email).toBe(
      "Enter a valid email address.",
    );
  });

  it("requires a password", () => {
    expect(validateLogin({ email: "owner@example.com", password: "" }).password).toBe(
      "Enter your password.",
    );
  });
});

describe("validateEmail", () => {
  it("accepts a valid email", () => {
    expect(validateEmail("owner@example.com")).toBeNull();
  });

  it("rejects an empty email", () => {
    expect(validateEmail("")).toBe("Enter an email address.");
  });

  it("rejects an invalid email", () => {
    expect(validateEmail("owner@example")).toBe("Enter a valid email address.");
  });

  it("rejects a long email", () => {
    expect(validateEmail(`${"a".repeat(250)}@example.com`)).toBe(
      "Email addresses must be 254 characters or fewer.",
    );
  });
});

describe("validatePassword", () => {
  it("accepts a password of at least 12 characters", () => {
    expect(validatePassword("a".repeat(12))).toBeNull();
  });

  it("rejects a short password", () => {
    expect(validatePassword("short")).toBe(
      "Use at least 12 characters for the owner password.",
    );
  });

  it("rejects a long password", () => {
    expect(validatePassword("a".repeat(201))).toBe(
      "Passwords must be 200 characters or fewer.",
    );
  });
});

describe("validateAltText", () => {
  it("accepts a description", () => {
    expect(validateAltText("A photo")).toBeNull();
  });

  it("requires a description", () => {
    expect(validateAltText(" ")).toBe(
      "Describe the image for screen reader users.",
    );
  });

  it("limits the description length", () => {
    expect(validateAltText("a".repeat(201))).toBe(
      "Image descriptions must be 200 characters or fewer.",
    );
  });
});

describe("isUuid", () => {
  it("accepts a UUID", () => {
    expect(isUuid("8c6e222e-9074-44cf-bed3-5cd2271fa416")).toBe(true);
  });

  it("rejects non-UUID values", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

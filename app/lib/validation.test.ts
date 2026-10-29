import { describe, expect, it } from "vitest";
import {
  isUuid,
  readLoginForm,
  readPostForm,
  validateAltText,
  validateDraftSave,
  validateEmail,
  validateLogin,
  validatePassword,
  validatePost,
  validatePublish,
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

describe("validateDraftSave", () => {
  // Values for a new or draft-only post. The second argument of
  // validateDraftSave is true when the target row is published, so the
  // submitted address is ignored for it.
  const draftOnlyValues = {
    title: "Hello",
    slug: "hello",
    body: "",
    excerpt: "",
    published: false,
  };

  it("rejects a draft save without a title and shows no address error", () => {
    expect(
      validateDraftSave({ ...draftOnlyValues, title: "", slug: "post" }),
    ).toEqual({
      title: "Enter a title.",
    });
    expect(
      validateDraftSave({ ...draftOnlyValues, title: "", slug: "" }),
    ).toEqual({
      title: "Enter a title.",
    });
  });

  it("accepts a draft with a title and an empty body", () => {
    expect(validateDraftSave(draftOnlyValues)).toEqual({});
    expect(
      validateDraftSave({ ...draftOnlyValues, body: "   " }).body,
    ).toBeUndefined();
  });

  it("accepts a draft save whose address is derived from the title", () => {
    const form = new FormData();
    form.set("title", "Hello World");
    form.set("body", "");
    const values = readPostForm(form);
    expect(values.slug).toBe("hello-world");
    expect(validateDraftSave(values)).toEqual({});
  });

  it("applies the existing address rules to a new or draft-only post", () => {
    expect(validateDraftSave({ ...draftOnlyValues, slug: "" }).slug).toBe(
      "Enter a slug.",
    );
    expect(
      validateDraftSave({ ...draftOnlyValues, slug: "a".repeat(101) }).slug,
    ).toBe("Slugs must be 100 characters or fewer.");
    expect(
      validateDraftSave({ ...draftOnlyValues, slug: "Hello World" }).slug,
    ).toBe("Use lowercase letters, numbers, and single hyphens.");
  });

  it("ignores a submitted address for a published post", () => {
    expect(
      validateDraftSave({ ...draftOnlyValues, slug: "Different Address" }, true),
    ).toEqual({});
  });

  it("limits the title to 200 characters", () => {
    expect(
      validateDraftSave({ ...draftOnlyValues, title: "t".repeat(201) }).title,
    ).toBe("Titles must be 200 characters or fewer.");
  });

  it("limits the body to 100,000 characters", () => {
    expect(
      validateDraftSave({ ...draftOnlyValues, body: "b".repeat(100_001) }).body,
    ).toBe("Post bodies must be 100,000 characters or fewer.");
  });

  it("limits the excerpt to 400 characters", () => {
    expect(
      validateDraftSave({ ...draftOnlyValues, excerpt: "x".repeat(401) }).excerpt,
    ).toBe("Excerpts must be 400 characters or fewer.");
  });
});

describe("validatePublish", () => {
  const newPostValues = {
    title: "Hello",
    slug: "hello",
    body: "Some text",
    excerpt: "Some text",
    published: true,
  };

  it("accepts a valid publish", () => {
    expect(validatePublish(newPostValues)).toEqual({});
  });

  it("rejects a publish with an empty body", () => {
    expect(validatePublish({ ...newPostValues, body: "" }).body).toBe(
      "Write the post body in Markdown.",
    );
    expect(validatePublish({ ...newPostValues, body: "   " }).body).toBe(
      "Write the post body in Markdown.",
    );
  });

  it("rejects a publish with an empty title", () => {
    expect(
      validatePublish({
        title: "",
        slug: "a-post",
        body: "Body text.",
        excerpt: "Excerpt.",
        published: true,
      }).title,
    ).toBe("Enter a title.");
  });

  it("applies the existing address rules to a new or draft-only post", () => {
    expect(validatePublish({ ...newPostValues, slug: "" }).slug).toBe(
      "Enter a slug.",
    );
    expect(
      validatePublish({ ...newPostValues, slug: "a".repeat(101) }).slug,
    ).toBe("Slugs must be 100 characters or fewer.");
    expect(
      validatePublish({ ...newPostValues, slug: "Hello World" }).slug,
    ).toBe("Use lowercase letters, numbers, and single hyphens.");
  });

  it("ignores a submitted address for a published post", () => {
    expect(
      validatePublish({ ...newPostValues, slug: "Different Address" }, true),
    ).toEqual({});
  });

  it("limits the title to 200 characters", () => {
    expect(
      validatePublish({ ...newPostValues, title: "t".repeat(201) }).title,
    ).toBe("Titles must be 200 characters or fewer.");
  });

  it("limits the body to 100,000 characters", () => {
    expect(
      validatePublish({ ...newPostValues, body: "b".repeat(100_001) }).body,
    ).toBe("Post bodies must be 100,000 characters or fewer.");
  });

  it("limits the excerpt to 400 characters", () => {
    expect(
      validatePublish({ ...newPostValues, excerpt: "x".repeat(401) }).excerpt,
    ).toBe("Excerpts must be 400 characters or fewer.");
  });
});

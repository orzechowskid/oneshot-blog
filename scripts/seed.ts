const appUrl = process.env.APP_URL ?? "https://oneshot-blog.fly.dev";
const seedToken = process.env.SEED_TOKEN;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!seedToken) {
  throw new Error("SEED_TOKEN is required.");
}
if (!email) {
  throw new Error("ADMIN_EMAIL is required.");
}
if (!password) {
  throw new Error("ADMIN_PASSWORD is required.");
}

const response = await fetch(new URL("/internal/seed", appUrl), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Seed-Token": seedToken,
  },
  body: JSON.stringify({ email, password }),
});

const body = await response.text();

if (response.status === 409) {
  console.log("Owner account already exists. Nothing to seed.");
  process.exit(0);
}

if (!response.ok) {
  throw new Error(`Seed failed (${response.status}): ${body}`);
}

console.log(`Owner account seeded for ${email}.`);

export {};

import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("health", "routes/health.tsx"),
  route("posts/:slug", "routes/post.tsx"),
  route("images/:id", "routes/image.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("internal/seed", "routes/seed.tsx"),
  route("admin/preview", "routes/admin-preview.tsx"),
  route("admin/autosave", "routes/admin-autosave.tsx"),
  layout("routes/admin-layout.tsx", [
    route("admin", "routes/admin-index.tsx"),
    route("admin/new", "routes/admin-new.tsx"),
    route("admin/:id/edit", "routes/admin-edit.tsx"),
  ]),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;

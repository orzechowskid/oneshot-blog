import express from "express";
import type { ServerBuild } from "react-router";
import { createRequestHandler } from "@react-router/express";

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 3000);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

if (isProduction) {
  const buildUrl = new URL("./build/server/index.js", import.meta.url);
  const build = (await import(buildUrl.href)) as unknown as ServerBuild;

  app.use(
    express.static("build/client", {
      index: false,
      maxAge: "1h",
    }),
  );

  app.use(
    createRequestHandler({
      build,
      mode: "production",
    }),
  );
} else {
  const { createServer } = await import("vite");
  const viteDevServer = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
  });

  app.use(viteDevServer.middlewares);

  app.use(
    createRequestHandler({
      build: () =>
        viteDevServer.ssrLoadModule(
          "virtual:react-router/server-build",
        ) as Promise<ServerBuild>,
      mode: "development",
    }),
  );
}

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    response.status(500).send("Internal Server Error");
  },
);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

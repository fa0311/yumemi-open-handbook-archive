import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { main } from "./main.js";
import { getEnv } from "./utils/config.js";
import { logger } from "./utils/logger.js";

const server = async () => {
  const env = await getEnv();
  const app = new Hono();

  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    logger.info(`${c.req.method} ${c.req.path} - ${c.res.status} (${duration}ms)`);
  });

  app.use("/*", serveStatic({ root: `./${env.OUTPUT_DIR}` }));
  app.get("/", serveStatic({ path: `./${env.OUTPUT_DIR}/index.html` }));

  logger.info("Starting server on http://localhost:3000");
  serve({
    fetch: app.fetch,
  });
};

await server();
await main();

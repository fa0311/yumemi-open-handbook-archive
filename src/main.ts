import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { load } from "cheerio";
import { createBrowser } from "./utils/browser.js";
import { getEnv } from "./utils/config.js";
import { logger } from "./utils/logger.js";

const downloadResource = async (url: string, outputPath: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(buffer));
  logger.info(`Saved: ${outputPath}`);
  return { url, path: outputPath };
};

const generateSafePath = (url: URL): string => {
  const pathSegments = url.pathname.split("/").filter(Boolean);

  const directories = pathSegments.slice(0, -1).map((segment) => {
    const decoded = decodeURIComponent(segment);
    return decoded;
  });

  const lastSegment = pathSegments[pathSegments.length - 1] || "index";
  const extension = lastSegment.includes(".") ? lastSegment.slice(lastSegment.lastIndexOf(".")) : "";

  const uniqueIdentifier = lastSegment + url.search;
  const hash = createHash("sha256").update(uniqueIdentifier).digest("hex");

  return join(...directories, `${hash}${extension}`);
};

const replacePath = (htmlContent: string, baseUrl: string) => {
  const $ = load(htmlContent);

  const cssUrls = $('link[rel="stylesheet"][href]')
    .get()
    .map((elem) => {
      const href = $(elem).attr("href")!;
      const newHref = generateSafePath(new URL(href, baseUrl));
      $(elem).attr("href", newHref);
      return [new URL(href, baseUrl), newHref] as const;
    });

  const imageUrls = $("img[src]")
    .get()
    .filter((elem) => $(elem).attr("src") && !$(elem).attr("src")!.startsWith("data:"))
    .map((elem) => {
      const src = $(elem).attr("src")!;
      const newSrc = generateSafePath(new URL(src, baseUrl));
      $(elem).attr("src", newSrc);
      return [new URL(src, baseUrl), newSrc] as const;
    });

  const unique = <T>(array: T[]) => Array.from(new Set(array));
  return { cssUrls: unique(cssUrls), imageUrls: unique(imageUrls), html: $.html() };
};

const syncLoop = async <T1, T2>(items: T1[], callback: (item: T1) => Promise<T2>) => {
  const res: T2[] = [];
  for (const item of items) {
    res.push(await callback(item));
  }
  return res;
};

export const main = async () => {
  const env = await getEnv();

  await createBrowser(
    {
      paramsOptions: { headless: false },
      viewportOptions: { width: env.VIEWPORT_WIDTH, height: env.VIEWPORT_HEIGHT },
      gotoOptions: { waitUntil: "networkidle2", timeout: env.PAGE_LOAD_TIMEOUT },
      delay: env.CONTENT_STABILIZATION_DELAY,
    },
    async ({ goto }) => {
      const page = await goto(env.TARGET_URL);
      const htmlContent = await page.content();

      const { cssUrls, imageUrls, html } = replacePath(htmlContent, env.TARGET_URL);
      await mkdir(env.OUTPUT_DIR, { recursive: true });
      await syncLoop(cssUrls, ([url, path]) => downloadResource(url.href, join(env.OUTPUT_DIR, path)));
      await syncLoop(imageUrls, ([url, path]) => downloadResource(url.href, join(env.OUTPUT_DIR, path)));
      await writeFile(join(env.OUTPUT_DIR, "index.html"), html, "utf-8");
    },
  );
};

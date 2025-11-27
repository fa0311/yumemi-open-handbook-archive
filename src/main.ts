import { createHash } from "node:crypto";
import { posix } from "node:path";
import { type CheerioAPI, load } from "cheerio";
import sanitize from "sanitize-filename";
import { createBrowser } from "./utils/browser.js";
import { getEnv } from "./utils/config.js";
import { logger } from "./utils/logger.js";
import { mkWriteFile } from "./utils/mkdir.js";
import { createSet } from "./utils/set.js";
import { doWhileSync, syncLoop } from "./utils/sync.js";

const cleanUrl = (input: URL) => {
  const newUrl = new URL(input.href);
  newUrl.search = "";
  newUrl.hash = "";
  return newUrl;
};

const downloadResource = async (url: URL, outputPath: string) => {
  try {
    logger.info(`Downloading: ${url.href}`);
    const response = await fetch(url.href);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      await mkWriteFile(outputPath, Buffer.from(buffer));
      return { url, path: outputPath };
    } else {
      logger.error(`Failed to download: ${url.href} - Status: ${response.status}`);
    }
  } catch (error) {
    logger.error(`Error downloading: ${url.href} - ${error}`);
  }
};

const generateSafePath = (url: URL, basePath: string, isDirectory: boolean) => {
  const toSafeName = (name: string) => {
    const trimedName = name.trim();
    const safeName = sanitize(trimedName).slice(0, 42);
    if (safeName === trimedName) {
      return safeName;
    } else {
      const hash = createHash("sha256").update(trimedName).digest("hex").slice(0, 8);
      return `${safeName}_${hash}`;
    }
  };

  const pathSegments = url.pathname.split("/").filter(Boolean);

  if (isDirectory) {
    const directories = pathSegments.map((segment) => {
      const decoded = decodeURIComponent(segment);
      return toSafeName(decoded);
    });
    return posix.join(basePath, ...directories);
  } else {
    const directories = pathSegments.slice(0, -1).map((segment) => {
      const decoded = decodeURIComponent(segment);
      return toSafeName(decoded);
    });

    const lastSegment = pathSegments[pathSegments.length - 1]!;
    const extension = lastSegment.includes(".") ? lastSegment.slice(lastSegment.lastIndexOf(".")) : "";
    const name = extension ? lastSegment.slice(0, lastSegment.lastIndexOf(".")) : lastSegment;
    const safeName = toSafeName(decodeURIComponent(name));

    return posix.join(basePath, ...directories, `${safeName}${extension}`);
  }
};

const getChildUrls = ($: CheerioAPI, baseUrl: URL, basePath: string) => {
  const urls = $("a[href]")
    .get()
    .filter((elem) => {
      const href = $(elem).attr("href");
      return href && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("javascript:");
    })
    .map((elem) => {
      const href = $(elem).attr("href")!;
      const url = new URL(href, baseUrl);
      const newHref = generateSafePath(url, basePath, true);
      $(elem).attr("href", newHref);
      return [url, newHref] as [URL, string];
    })
    .filter(([url]) => url.origin === new URL(baseUrl).origin);
  return [...urls];
};

const replaceUrl = ($: CheerioAPI, baseUrl: URL, basePath: string) => {
  const linkUrls = $("link[href][rel='stylesheet']")
    .get()
    .filter((elem) => {
      const href = $(elem).attr("href");
      return href && !href.startsWith("data:");
    })
    .map((elem) => {
      const href = $(elem).attr("href")!;
      const url = new URL(href, baseUrl);
      const newHref = generateSafePath(url, basePath, false);
      $(elem).attr("href", newHref);
      return [url, newHref] as [URL, string];
    });

  const query = [
    "link[href][type='image/x-icon']",
    "link[href][rel='shortcut icon']",
    "link[href][rel='icon']",
    "link[href][rel='apple-touch-icon']",
  ];
  const linkIcons = $(query.join(","))
    .get()
    .filter((elem) => {
      const href = $(elem).attr("href");
      return href && !href.startsWith("data:");
    })
    .map((elem) => {
      const href = $(elem).attr("href")!;
      const url = new URL(href, baseUrl);
      const newHref = generateSafePath(url, basePath, false);
      $(elem).attr("href", newHref);
      return [url, newHref] as [URL, string];
    });

  const ogImageUrls = $('meta[name="twitter:image"][content], meta[property="og:image"][content]')
    .get()
    .filter((elem) => {
      const content = $(elem).attr("content");
      return content && !content.startsWith("data:");
    })
    .map((elem) => {
      const content = $(elem).attr("content")!;
      const url = new URL(content, baseUrl);
      const newContent = generateSafePath(url, basePath, false);
      $(elem).attr("content", newContent);
      return [url, newContent] as [URL, string];
    });

  const imageUrls = $("img[src]")
    .get()
    .filter((elem) => {
      const src = $(elem).attr("src");
      return src && !src.startsWith("data:");
    })
    .map((elem) => {
      const src = $(elem).attr("src")!;
      const url = new URL(src, baseUrl);
      const newSrc = generateSafePath(url, basePath, false);
      $(elem).attr("src", newSrc);
      return [url, newSrc] as [URL, string];
    });

  // const scriptUrls = $("script[src]")
  //   .get()
  //   .filter((elem) => {
  //     const src = $(elem).attr("src");
  //     return src && !src.startsWith("data:");
  //   })
  //   .map((elem) => {
  //     const src = $(elem).attr("src")!;
  //     const url = new URL(src, baseUrl);
  //     const newSrc = generateSafePath(url, false);
  //     $(elem).attr("src", newSrc);
  //     return [url, newSrc] as [URL, string];
  //   });

  const inlineStyleUrls = $("[style]")
    .get()
    .flatMap((elem) => {
      const style = $(elem).attr("style")!;

      const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g;
      const matches = Array.from(style.matchAll(urlRegex));
      return matches
        .map((match) => [match[0], match[1]] as [string, string])
        .filter(([, urlStr]) => !urlStr.startsWith("data:"))
        .map((match) => {
          const urlStr = match[1];
          const url = new URL(urlStr, baseUrl);
          const newPath = generateSafePath(url, basePath, false);

          const oldStyle = $(elem).attr("style")!;
          const newStyle = oldStyle.replace(match[0], `url("${newPath}")`);
          $(elem).attr("style", newStyle);

          return [url, newPath] as [URL, string];
        })
        .filter((item): item is [URL, string] => item !== null);
    });

  return [...linkUrls, ...linkIcons, ...ogImageUrls, ...imageUrls, ...inlineStyleUrls];
};

export const main = async () => {
  const env = await getEnv();
  const target = new URL(env.TARGET_URL);
  const urls = createSet<[URL, string]>([[target, ""]], ([url]) => cleanUrl(url).href);
  const assets = createSet<[URL, string]>([], ([url]) => cleanUrl(url).href);

  await createBrowser(
    {
      paramsOptions: {
        headless: env.HEADLESS,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
        ],
      },
      viewportOptions: { width: env.VIEWPORT_WIDTH, height: env.VIEWPORT_HEIGHT },
      gotoOptions: { waitUntil: "networkidle2", timeout: env.PAGE_LOAD_TIMEOUT },
    },
    async ({ goto }) => {
      await syncLoop(urls, async ([rawUrl, file]) => {
        const [res, page] = await goto(rawUrl);
        logger.info(`Processing: ${rawUrl.href}`);
        if (res?.ok()) {
          const url = new URL(res.url());
          if (rawUrl.href !== url.href) {
            logger.warn(`Redirected: ${rawUrl.href} -> ${url.href}`);
          }
          if (url.origin !== target.origin) {
            logger.warn(`Skipped external URL: ${url.href}`);
            return;
          }

          await doWhileSync(async () => {
            await doWhileSync(async () => {
              const query = [
                '.notion-list-item-box-left div[aria-expanded="false"] svg.arrowCaretDownFillSmall',
                'div[role="button"] svg.arrowStraightDownFillSmall',
              ];
              const elements = await page.$$(query.join(","));
              await syncLoop(elements, async (el) => {
                await el.click().catch(() => {});
              });
              return elements.length > 0;
            });
            const before = (await page.$$("div")).length;
            await syncLoop(Array(10), async (_) => {
              await page.mouse.wheel({ deltaY: 2 ** 32 }).catch(() => {});
              await new Promise((resolve) => setTimeout(resolve, 100));
            });
            const after = (await page.$$("div")).length;
            return before !== after;
          });

          const htmlContent = await page.content();
          const $ = load(htmlContent);
          const childUrls = getChildUrls($, url, env.DEPLOY_BASE_PATH);
          urls.addSet(...childUrls);

          const newAssets = replaceUrl($, url, env.DEPLOY_BASE_PATH);
          assets.addSet(...newAssets);

          const path = posix.join(env.OUTPUT_DIR, file, `index.html`);
          await mkWriteFile(path, $.html());
        } else {
          logger.error(`Failed to load page: ${rawUrl.href} - Status: ${res?.status()}`);
        }
      });
    },
  );

  logger.info(`Starting download of ${assets.length()}.`);
  await syncLoop(assets, async ([url, path]) => {
    await new Promise((resolve) => setTimeout(resolve, env.CONTENT_DOWNLOAD_DELAY));
    return downloadResource(url, posix.join(env.OUTPUT_DIR, path));
  });
};

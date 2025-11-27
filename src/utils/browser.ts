import puppeteer, { type GoToOptions, type LaunchOptions, type Page, type Viewport } from "puppeteer";

type createBrowserType = {
  paramsOptions: LaunchOptions;
  viewportOptions: Viewport;
  gotoOptions: GoToOptions;
};

export const createBrowser = async <T>(
  param: createBrowserType,
  callback: (context: ReturnType<typeof browserParam>) => Promise<T>,
) => {
  const browser = await puppeteer.launch(param.paramsOptions);
  const page = await browser.newPage();
  await page.setViewport(param.viewportOptions);

  try {
    return await callback(browserParam(page, param));
  } finally {
    await browser.close();
  }
};

const browserParam = (page: Page, param: createBrowserType) => {
  const goto = async (url: URL) => {
    const res = await page.goto(url.href, param.gotoOptions);
    return [res, page] as const;
  };
  return { goto };
};

import puppeteer, { type GoToOptions, type LaunchOptions, type Page, type Viewport } from "puppeteer";

type createBrowserType = {
  paramsOptions: LaunchOptions;
  viewportOptions: Viewport;
  gotoOptions: GoToOptions;
  delay: number;
};

export const createBrowser = async (
  param: createBrowserType,
  callback: (context: ReturnType<typeof browserParam>) => Promise<void>,
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
  const goto = async (url: string) => {
    await page.goto(url, param.gotoOptions);
    await new Promise((resolve) => setTimeout(resolve, param.delay));
    return page;
  };
  return { goto };
};

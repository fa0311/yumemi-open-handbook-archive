import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { logger } from "./logger.js";

export const mkWriteFile = async (path: string, data: Buffer | string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  logger.info(`Saved: ${path}`);
};

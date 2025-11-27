import { config } from "dotenv";
import { z } from "zod";

// 環境変数のスキーマ定義
const envSchema = z.object({
  TARGET_URL: z
    .string()
    .default("https://yumemi.notion.site/")
    .transform((url) => new URL(url)),
  DEPLOY_BASE_PATH: z.string().default("/yumemi-open-handbook-archive/"),
  OUTPUT_DIR: z.string().default("output"),
  VIEWPORT_WIDTH: z.coerce.number().int().positive().default(1920),
  VIEWPORT_HEIGHT: z.coerce.number().int().positive().default(1080),
  PAGE_LOAD_TIMEOUT: z.coerce.number().int().positive().default(60000),
  CONTENT_DOWNLOAD_DELAY: z.coerce.number().int().nonnegative().default(0),
  DEV_SERVER_PORT: z.coerce.number().int().positive().default(3000),
  HEADLESS: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
});

// 環境変数をパースして検証
const parseEnv = (async () => {
  config();
  const result = await envSchema.safeParseAsync(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.format());
    throw new Error("Environment validation failed");
  }

  return result.data;
})();

export const getEnv = async () => await parseEnv;

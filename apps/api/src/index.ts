import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./lib/logger";

createApp().listen(config.port, () => {
  logger.info(`API listening on http://localhost:${config.port}`);
  if (!config.smtp.host) logger.info("SMTP not configured: verification codes will be printed here.");
});

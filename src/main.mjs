import { createHost } from './host.mjs';
import { googleSync } from './google.mjs';
import { run } from './runtime.mjs';
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
await run(createHost(), googleSync, {
  signal: controller.signal
});

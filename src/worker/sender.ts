import { getFrequency, tick } from "../lib/app/commands";
import { getRuntime } from "../lib/app/runtime";

const MIN_SLEEP_MS = 5_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("sender awake");
  for (;;) {
    let sleepMs = 30_000;
    try {
      const ctx = await getRuntime();
      const pace = await getFrequency(ctx);
      const result = await tick(ctx);
      sleepMs = Math.max(pace.minGapMinutes * 60 * 1000, MIN_SLEEP_MS);
      console.log(
        JSON.stringify({
          processed: result.processed,
          gapMinutes: pace.minGapMinutes,
          connectionsUsed: pace.connectionsUsed,
          connectionCap: pace.connectionCap,
          at: new Date().toISOString(),
        }),
      );
    } catch (err) {
      console.error(err instanceof Error ? err.message : "sender check failed");
    }
    await sleep(sleepMs);
  }
}

void main();

import { getRuntime } from "../app/runtime";
import { tick } from "../app/commands";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  setInterval(() => {
    void (async () => {
      try {
        const ctx = await getRuntime();
        await tick(ctx);
      } catch (err) {
        console.error("scheduler tick failed", err);
      }
    })();
  }, 60_000);
}

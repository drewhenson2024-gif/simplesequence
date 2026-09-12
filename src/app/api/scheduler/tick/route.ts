import { tick } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

export async function POST() {
  return withCommand(async () => tick(await getRuntime(), { ignoreWorkingHours: true }));
}

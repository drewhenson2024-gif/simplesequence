import { listLists } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

export async function GET() {
  return withCommand(async () => listLists(await getRuntime()));
}

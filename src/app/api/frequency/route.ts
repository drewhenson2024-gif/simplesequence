import { z } from "zod";
import { getFrequency, updateFrequency } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  connectionCap: z.number().int().optional(),
  minGapMinutes: z.number().int().optional(),
});

export async function GET() {
  return withCommand(async () => getFrequency(await getRuntime()));
}

export async function PATCH(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return updateFrequency(await getRuntime(), input);
  });
}

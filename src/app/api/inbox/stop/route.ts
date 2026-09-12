import { z } from "zod";
import { stopLead } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({ enrollmentId: z.string() });

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return stopLead(await getRuntime(), input.enrollmentId);
  });
}

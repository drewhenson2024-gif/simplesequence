import { z } from "zod";
import { handleUnipileWebhook } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  eventId: z.string(),
  type: z.string(),
  senderId: z.string().optional(),
  enrollmentId: z.string().optional(),
  body: z.string().optional(),
});

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return handleUnipileWebhook(await getRuntime(), input);
  });
}

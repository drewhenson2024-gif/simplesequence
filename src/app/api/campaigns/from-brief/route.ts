import { z } from "zod";
import { promptToCampaign } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  brief: z.string().min(1),
  limit: z.number().int().positive().optional(),
  name: z.string().optional(),
  templateKey: z.enum(["linkedin_only", "email_only", "mixed"]).optional(),
});

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return promptToCampaign(await getRuntime(), input);
  });
}

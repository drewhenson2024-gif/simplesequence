import { z } from "zod";
import { createCampaign, listCampaigns } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  name: z.string().min(1),
  templateKey: z.enum(["linkedin_only", "email_only", "mixed"]).optional(),
});

export async function GET() {
  return withCommand(async () => listCampaigns(await getRuntime()));
}

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return createCampaign(await getRuntime(), input);
  });
}

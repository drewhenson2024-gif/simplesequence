import { z } from "zod";
import { createCampaign, createCampaignFromPair, listCampaigns } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const pairSchema = z.object({
  sequenceId: z.string().min(1),
  listId: z.string().min(1),
  name: z.string().optional(),
});

const nameSchema = z.object({
  name: z.string().min(1),
  templateKey: z.enum(["linkedin_only"]).optional(),
});

export async function GET() {
  return withCommand(async () => listCampaigns(await getRuntime()));
}

export async function POST(req: Request) {
  return withCommand(async () => {
    const body = await req.json();
    const ctx = await getRuntime();
    const pair = pairSchema.safeParse(body);
    if (pair.success) return createCampaignFromPair(ctx, pair.data);
    const input = nameSchema.parse(body);
    return createCampaign(ctx, input);
  });
}

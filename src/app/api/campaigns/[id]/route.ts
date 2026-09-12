import { z } from "zod";
import { getCampaign, updateCampaign } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  name: z.string().optional(),
  linkedinSenderId: z.string().nullable().optional(),
  emailSenderId: z.string().nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withCommand(async () => getCampaign(await getRuntime(), id));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return updateCampaign(await getRuntime(), id, input);
  });
}

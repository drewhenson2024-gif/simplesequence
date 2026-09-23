import { z } from "zod";
import { deleteCampaign, getCampaign, updateCampaign } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const stepSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  channel: z.enum(["linkedin"]),
  action: z.enum(["connection", "message"]),
  delayHours: z.number().nonnegative(),
  bodyTemplate: z.string(),
  subjectTemplate: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  skipOverdueHours: z.number().int().nonnegative().optional(),
  imageUrl: z.string().nullable().optional(),
});

const schema = z.object({
  name: z.string().optional(),
  linkedinSenderId: z.string().nullable().optional(),
  priority: z.number().int().optional(),
  steps: z.array(stepSchema).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withCommand(async () => getCampaign(await getRuntime(), id));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return updateCampaign(await getRuntime(), id, {
      name: input.name,
      linkedinSenderId: input.linkedinSenderId,
      priority: input.priority,
      steps: input.steps?.map((step) => ({
        ...step,
        subjectTemplate: step.subjectTemplate ?? null,
        imageUrl: step.imageUrl ?? null,
      })),
    });
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withCommand(async () => deleteCampaign(await getRuntime(), id));
}

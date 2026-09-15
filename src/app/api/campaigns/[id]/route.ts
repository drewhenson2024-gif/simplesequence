import { z } from "zod";
import { getCampaign, updateCampaign } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const stepSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  channel: z.enum(["linkedin", "email", "gift"]),
  action: z.enum(["connection", "message", "email", "gift"]),
  delayHours: z.number().nonnegative(),
  bodyTemplate: z.string(),
  subjectTemplate: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  skipOverdueHours: z.number().int().nonnegative().optional(),
  imageUrl: z.string().nullable().optional(),
  giftItem: z.string().nullable().optional(),
  giftNote: z.string().nullable().optional(),
});

const schema = z.object({
  name: z.string().optional(),
  linkedinSenderId: z.string().nullable().optional(),
  emailSenderId: z.string().nullable().optional(),
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
      emailSenderId: input.emailSenderId,
      steps: input.steps?.map((step) => ({
        ...step,
        subjectTemplate: step.subjectTemplate ?? null,
        imageUrl: step.imageUrl ?? null,
        giftItem: step.giftItem ?? null,
        giftNote: step.giftNote ?? null,
      })),
    });
  });
}

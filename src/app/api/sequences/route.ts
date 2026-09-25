import { z } from "zod";
import { createSequence, listSequences } from "@/lib/app/commands";
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
  imageUrl: z.string().nullable().optional(),
});

const schema = z.object({
  name: z.string().min(1),
  steps: z.array(stepSchema).optional(),
});

export async function GET() {
  return withCommand(async () => listSequences(await getRuntime()));
}

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return createSequence(await getRuntime(), {
      name: input.name,
      steps: input.steps?.map((step) => ({ ...step, subjectTemplate: step.subjectTemplate ?? null })),
    });
  });
}

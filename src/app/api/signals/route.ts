import { z } from "zod";
import { ingestSignals, listSignals } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";
import { SIGNAL_TYPES } from "@/lib/signals/catalog";

const ingestSchema = z.object({
  signals: z
    .array(
      z.object({
        type: z.enum(SIGNAL_TYPES),
        title: z.string(),
        detail: z.string().optional(),
        company: z.string().optional(),
        personName: z.string().optional(),
        source: z.string().optional(),
        occurredAt: z.string().optional(),
        leadId: z.string().optional(),
      }),
    )
    .optional(),
});

export async function GET() {
  return withCommand(async () => listSignals(await getRuntime()));
}

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = ingestSchema.parse(await req.json().catch(() => ({})));
    return ingestSignals(await getRuntime(), input);
  });
}

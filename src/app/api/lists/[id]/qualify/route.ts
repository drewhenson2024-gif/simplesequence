import { z } from "zod";
import { qualifyLeads } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  criteria: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return qualifyLeads(await getRuntime(), id, input.criteria);
  });
}

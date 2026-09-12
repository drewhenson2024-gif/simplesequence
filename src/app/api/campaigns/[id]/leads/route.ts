import { z } from "zod";
import { addLeadsToCampaign } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  listId: z.string().optional(),
  content: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return addLeadsToCampaign(await getRuntime(), id, input);
  });
}

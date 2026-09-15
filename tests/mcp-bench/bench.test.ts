import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getList, type AppContext } from "@/lib/app/commands";
import { PROMPT_TO_CAMPAIGN_BRIEFS } from "@/lib/data/catalog";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { callMcpTool, MCP_TOOLS } from "@/lib/mcp/handler";
import { MockUnipile } from "@/lib/unipile/port";

/**
 * Local replay of Cluster's 25-task MCP bench against our commands/MCP.
 * No live Codex agent. Structural checks only (draft, recipients, steps, delays,
 * merge vars, qualification decision + explanation).
 */
const fixture = (name: string) => readFileSync(path.join(process.cwd(), "fixtures", name), "utf8");

async function testApp() {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
  const ctx: AppContext = {
    db: app.db,
    client: app.client,
    unipile: new MockUnipile(),
    clock: { now: () => new Date("2026-09-14T17:00:00.000Z") },
    actor: "mcp-bench",
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
  return ctx;
}

function csvLeads(n: number, opts?: { opening?: boolean; email?: boolean }): string {
  const header = "first_name,last_name,company,title,email,linkedin_url,opening_line,public_url";
  const rows = Array.from({ length: n }, (_, i) => {
    const email = opts?.email === false ? "" : `p${i}@example.com`;
    const opener = opts?.opening === false ? "" : `Noticed your work at Co${i}`;
    return `P${i},Lead${i},Co${i},Operator,${email},https://www.linkedin.com/in/person-${i},${opener},https://example.com/p${i}`;
  });
  return [header, ...rows].join("\n");
}

function markdown87(): string {
  const lines = ["| name | linkedin |", "| --- | --- |"];
  for (let i = 1; i <= 87; i += 1) {
    lines.push(`| Person ${i} | https://www.linkedin.com/in/person-${i} |`);
  }
  return lines.join("\n");
}

type CampaignView = {
  id: string;
  status: string;
  steps: Array<{
    channel: string;
    action: string;
    delayHours: number;
    bodyTemplate: string;
    subjectTemplate: string | null;
    imageUrl: string | null;
  }>;
  enrollments: Array<{
    status: string;
    lead: {
      firstName: string;
      openingLine: string;
      publicUrl: string | null;
      email: string | null;
    } | null;
  }>;
};

function assertDraftSequence(campaign: CampaignView, expectedLeads: number) {
  expect(campaign.status).toBe("draft");
  expect(campaign.enrollments).toHaveLength(expectedLeads);
  expect(campaign.steps.length).toBeGreaterThan(0);
  expect(campaign.steps.some((s) => s.bodyTemplate.includes("{{"))).toBe(true);
  expect(campaign.enrollments.every((e) => e.status === "pending")).toBe(true);
}

async function saveDraft(
  ctx: AppContext,
  input: {
    name: string;
    template_key?: "linkedin_only" | "email_only" | "mixed";
    content: string;
    format?: "csv" | "markdown" | "auto";
    steps?: unknown[];
    expectedLeads: number;
  },
): Promise<CampaignView> {
  const imported = (await callMcpTool(ctx, "import_leads", {
    content: input.content,
    format: input.format ?? "csv",
    list_name: input.name,
  })) as { listId: string };
  const created = (await callMcpTool(ctx, "create_campaign", {
    name: input.name,
    template_key: input.template_key,
    steps: input.steps,
  })) as { id: string; status: string };
  expect(created.status).toBe("draft");
  await callMcpTool(ctx, "add_leads_to_campaign", {
    campaign_id: created.id,
    list_id: imported.listId,
  });
  const campaign = (await callMcpTool(ctx, "get_campaign", { campaign_id: created.id })) as CampaignView;
  assertDraftSequence(campaign, input.expectedLeads);
  return campaign;
}

describe("mcp-bench coverage", () => {
  it("exposes the prospecting tools Cluster's agent would call", () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual(
      expect.arrayContaining(["search_people", "research_leads", "qualify_leads", "prompt_to_campaign"]),
    );
  });
});

describe("CSV import (2)", () => {
  it("Small CSV — 6 rows preserves fields", async () => {
    const ctx = await testApp();
    const imported = (await callMcpTool(ctx, "import_leads", {
      content: fixture("csv-6.csv"),
      list_name: "csv-6",
    })) as { listId: string; counts: { imported: number } };
    expect(imported.counts.imported).toBe(6);
    const list = await getList(ctx, imported.listId);
    const ada = list.leads.find((l) => l.email === "ada@example.com");
    expect(ada?.firstName).toBe("Ada");
    expect(ada?.company).toBe("Analytical Engines");
    expect(ada?.title).toBe("Countess");
    expect(ada?.openingLine).toContain("difference engines");
    expect(ada?.publicUrl).toBe("https://example.com/ada");
    expect(ada?.linkedinUrlNormalized).toBe("https://www.linkedin.com/in/ada-lovelace");
  });

  it("Two CSVs — 135 rows append without dropping columns", async () => {
    const ctx = await testApp();
    const header = "name,email,linkedin_url,company,title,custom_source";
    const block = (start: number, n: number) =>
      Array.from({ length: n }, (_, i) => {
        const i0 = start + i;
        return `Person ${i0},p${i0}@example.com,https://www.linkedin.com/in/p-${i0},Co${i0},Title${i0},bench`;
      }).join("\n");
    const first = (await callMcpTool(ctx, "import_leads", {
      content: `${header}\n${block(1, 70)}`,
      list_name: "append-135",
    })) as { listId: string; counts: { imported: number } };
    expect(first.counts.imported).toBe(70);
    const secondCsv = `${header},custom_note\n${block(1, 1).replace("\n", "")},keep-me\n${block(71, 65)}`;
    const second = (await callMcpTool(ctx, "import_leads", {
      list_id: first.listId,
      content: secondCsv,
    })) as { counts: { imported: number; merged: number } };
    expect(second.counts.merged).toBe(1);
    expect(second.counts.imported).toBe(65);
    const list = await getList(ctx, first.listId);
    expect(list.leads).toHaveLength(135);
    const pat = list.leads.find((l) => l.email === "p1@example.com");
    const custom = JSON.parse(pat?.customJson ?? "{}") as Record<string, string>;
    expect(custom.custom_source).toBe("bench");
    expect(custom.custom_note).toBe("keep-me");
  });
});

describe("Campaign creation (8)", () => {
  it("Basic email — 3 leads", async () => {
    const ctx = await testApp();
    const campaign = await saveDraft(ctx, {
      name: "Basic email",
      template_key: "email_only",
      content: csvLeads(3),
      expectedLeads: 3,
    });
    expect(campaign.steps.every((s) => s.channel === "email")).toBe(true);
    expect(campaign.steps[0]?.subjectTemplate).toContain("{{");
  });

  it("Basic LinkedIn — 3 leads", async () => {
    const ctx = await testApp();
    const campaign = await saveDraft(ctx, {
      name: "Basic LinkedIn",
      template_key: "linkedin_only",
      content: csvLeads(3),
      expectedLeads: 3,
    });
    expect(campaign.steps[0]?.action).toBe("connection");
    expect(campaign.steps[1]?.delayHours).toBe(24);
    expect(campaign.steps[2]?.delayHours).toBe(72);
  });

  it("Personalized LinkedIn — 40 leads", async () => {
    const ctx = await testApp();
    const campaign = await saveDraft(ctx, {
      name: "Personalized LinkedIn",
      template_key: "linkedin_only",
      content: csvLeads(40),
      expectedLeads: 40,
    });
    expect(campaign.enrollments[0]?.lead?.openingLine).toContain("Noticed");
    expect(campaign.steps.some((s) => s.bodyTemplate.includes("{{opening_line}}"))).toBe(true);
  });

  it("LinkedIn + email — 40 leads", async () => {
    const ctx = await testApp();
    const campaign = await saveDraft(ctx, {
      name: "Mixed 40",
      template_key: "mixed",
      content: csvLeads(40),
      expectedLeads: 40,
    });
    expect(campaign.steps.some((s) => s.channel === "linkedin")).toBe(true);
    expect(campaign.steps.some((s) => s.channel === "email")).toBe(true);
  });

  it("Connection requests, CSV — 87 leads", async () => {
    const ctx = await testApp();
    await saveDraft(ctx, {
      name: "CSV 87 connections",
      template_key: "linkedin_only",
      content: csvLeads(87, { email: false }),
      expectedLeads: 87,
    });
  });

  it("Connection requests, Markdown — 87 leads", async () => {
    const ctx = await testApp();
    await saveDraft(ctx, {
      name: "Markdown 87",
      template_key: "linkedin_only",
      content: markdown87(),
      format: "markdown",
      expectedLeads: 87,
    });
  });

  it("Email — 1,000 leads", async () => {
    const ctx = await testApp();
    await saveDraft(ctx, {
      name: "Email 1000",
      template_key: "email_only",
      content: csvLeads(1000),
      expectedLeads: 1000,
    });
  });

  it("LinkedIn + image — 3 leads", async () => {
    const ctx = await testApp();
    const campaign = await saveDraft(ctx, {
      name: "LinkedIn image",
      content: csvLeads(3),
      expectedLeads: 3,
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "connection",
          delayHours: 0,
          bodyTemplate: "Hi {{first_name}} — {{opening_line}}",
          imageUrl: "https://example.com/card.png",
        },
        {
          stepIndex: 1,
          channel: "linkedin",
          action: "message",
          delayHours: 24,
          bodyTemplate: "Thanks for connecting, {{first_name}}.",
          imageUrl: "https://example.com/followup.png",
        },
      ],
    });
    expect(campaign.steps[0]?.imageUrl).toBe("https://example.com/card.png");
    expect(campaign.steps[1]?.imageUrl).toBe("https://example.com/followup.png");
  });
});

describe("Prompt to campaign (9)", () => {
  it.each([...PROMPT_TO_CAMPAIGN_BRIEFS])("$title stays draft with researched openers", async (task) => {
    const ctx = await testApp();
    const campaign = (await callMcpTool(ctx, "prompt_to_campaign", {
      brief: task.brief,
      limit: task.limit,
      name: task.title,
    })) as CampaignView & { listId: string };
    expect(campaign.status).toBe("draft");
    expect(campaign.enrollments.length).toBeGreaterThan(0);
    expect(campaign.enrollments.length).toBeLessThanOrEqual(task.limit);
    expect(campaign.steps[0]?.action).toBe("connection");
    expect(campaign.steps.some((s) => s.bodyTemplate.includes("{{opening_line}}"))).toBe(true);
    expect(campaign.enrollments.every((e) => Boolean(e.lead?.openingLine))).toBe(true);
    expect(campaign.enrollments.every((e) => Boolean(e.lead?.publicUrl))).toBe(true);
    expect(campaign.listId).toBeTruthy();
  });
});

const QUALIFY_TASKS: Array<{ title: string; criteria: string; rows: string }> = [
  {
    title: "Air-export fit",
    criteria: "Air-export freight operators at logistics firms",
    rows: "name,title,company,email\nAda,Air-export Manager,FreightCo,ada@example.com\nBob,Marketing Lead,SaaSCo,bob@example.com\n",
  },
  {
    title: "Conditional qualification tiers",
    criteria: "Director or VP at US headquarters",
    rows: "name,title,company,email\nPat,Director of Ops,US Headquarters Inc,pat@example.com\nSam,Intern,Local Cafe,sam@example.com\n",
  },
  {
    title: "Current technical role",
    criteria: "Current technical role as engineer or developer",
    rows: "name,title,company,email\nNeha,Engineering Manager,Freshworks,neha@example.com\nKim,Account Executive,Brokerage,kim@example.com\n",
  },
  {
    title: "Production agents & HQ",
    criteria: "Production agents at company headquarters",
    rows: "name,title,company,email\nDana,Production Operator,HQ Logistics,dana@example.com\nChris,Sales,Storefront,chris@example.com\n",
  },
  {
    title: "R&D with exceptions",
    criteria: "R&D research roles with exceptions noted",
    rows: "name,title,company,email\nTaylor,R&D Scientist,LabCo,taylor@example.com\nJamie,Retail Clerk,Shop,jamie@example.com\n",
  },
  {
    title: "Security operators",
    criteria: "Security operators in a SOC or CISO org",
    rows: "name,title,company,email\nMorgan,SOC Analyst,Infosec Co,morgan@example.com\nRiley,Brand Manager,Agency,riley@example.com\n",
  },
];

describe("Qualification (6)", () => {
  it.each(QUALIFY_TASKS)("$title returns decision + explanation per lead", async (task) => {
    const ctx = await testApp();
    const imported = (await callMcpTool(ctx, "import_leads", {
      content: task.rows,
      list_name: task.title,
    })) as { listId: string };
    const result = (await callMcpTool(ctx, "qualify_leads", {
      list_id: imported.listId,
      criteria: task.criteria,
    })) as { leads: Array<{ decision: string; explanation: string; score: number; reason: string }> };
    expect(result.leads.length).toBeGreaterThan(0);
    for (const lead of result.leads) {
      expect(["fit", "maybe", "no"]).toContain(lead.decision);
      expect(lead.explanation.length).toBeGreaterThan(0);
      expect(lead.score).toBeGreaterThanOrEqual(0);
      expect(lead.score).toBeLessThanOrEqual(100);
      expect(lead.reason.length).toBeGreaterThan(0);
    }
    expect(result.leads.some((l) => l.decision === "fit" || l.decision === "maybe")).toBe(true);
  });
});

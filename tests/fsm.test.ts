import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  IllegalTransitionError,
  campaignStates,
  enrollmentStates,
  jobStates,
  senderStates,
  transitionCampaign,
  transitionEnrollment,
  transitionJob,
  transitionSender,
} from "@/lib/domain/fsm";
import { jitterMinutes } from "@/lib/domain/jitter";

describe("FSMs", () => {
  it("campaign draft can start and cannot skip to restricted from draft", () => {
    expect(transitionCampaign("draft", "running")).toBe("running");
    expect(() => transitionCampaign("draft", "restricted")).toThrow(IllegalTransitionError);
  });

  it("restricted campaign cannot be force-started", () => {
    expect(() => transitionCampaign("restricted", "running")).toThrow(IllegalTransitionError);
  });

  it("enrollment happy path", () => {
    expect(transitionEnrollment("pending", "waiting")).toBe("waiting");
    expect(transitionEnrollment("waiting", "in_progress")).toBe("in_progress");
    expect(transitionEnrollment("in_progress", "completed")).toBe("completed");
  });

  it("reply and bounce are terminal", () => {
    expect(transitionEnrollment("waiting", "replied")).toBe("replied");
    expect(transitionEnrollment("in_progress", "bounced")).toBe("bounced");
    expect(() => transitionEnrollment("replied", "waiting")).toThrow(IllegalTransitionError);
  });

  it("sender restriction cannot be overridden", () => {
    expect(transitionSender("healthy", "restricted")).toBe("restricted");
    expect(() => transitionSender("restricted", "healthy")).toThrow(IllegalTransitionError);
  });

  it("send_job claim path", () => {
    expect(transitionJob("pending", "claimed")).toBe("claimed");
    expect(transitionJob("claimed", "in_progress")).toBe("in_progress");
    expect(transitionJob("in_progress", "sent")).toBe("sent");
  });

  it("illegal random transitions throw (property)", () => {
    const machines = [
      { states: campaignStates, fn: transitionCampaign, name: "campaign" },
      { states: enrollmentStates, fn: transitionEnrollment, name: "enrollment" },
      { states: senderStates, fn: transitionSender, name: "sender" },
      { states: jobStates, fn: transitionJob, name: "job" },
    ] as const;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 20 }), (mi, si) => {
        const machine = machines[mi];
        const from = machine.states[si % machine.states.length];
        const to = machine.states[(si + 1) % machine.states.length];
        try {
          machine.fn(from as never, to as never);
        } catch (err) {
          expect(err).toBeInstanceOf(IllegalTransitionError);
        }
      }),
    );
  });

  it("jitter is deterministic for a job id", () => {
    expect(jitterMinutes("job_abc")).toBe(jitterMinutes("job_abc"));
    expect(jitterMinutes("job_abc")).toBeGreaterThanOrEqual(2);
    expect(jitterMinutes("job_abc")).toBeLessThanOrEqual(15);
  });
});

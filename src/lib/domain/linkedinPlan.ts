export type LinkedInPlan = "normal" | "premium" | "sales_navigator" | "recruiter";

export function planFromPremiumFeatures(features: string[] | null | undefined): LinkedInPlan {
  const text = (features ?? []).join(" ").toLowerCase();
  if (text.includes("recruiter")) return "recruiter";
  if (text.includes("sales")) return "sales_navigator";
  if (text.includes("premium")) return "premium";
  return "normal";
}

export function planFromUnipileAccount(account: {
  connection_params?: { im?: string | { premiumFeatures?: string[] } };
}): LinkedInPlan {
  const im = account.connection_params?.im;
  const features = im && typeof im === "object" ? im.premiumFeatures : [];
  return planFromPremiumFeatures(features);
}

export function canMessageBeforeAccept(plan: string | null | undefined): boolean {
  return plan === "premium" || plan === "sales_navigator" || plan === "recruiter";
}

export function planLabel(plan: string | null | undefined): string {
  if (plan === "premium") return "Premium";
  if (plan === "sales_navigator") return "Sales Navigator";
  if (plan === "recruiter") return "Recruiter";
  if (plan === "normal") return "Normal";
  return "Not checked";
}

export function planExplain(plan: string | null | undefined): string {
  if (plan === "recruiter" || plan === "sales_navigator" || plan === "premium") {
    return `${planLabel(plan)}. This account can send connection requests, messages after someone accepts, and messages before they accept.`;
  }
  if (plan === "normal") {
    return "Normal. This account can send connection requests and messages after someone accepts. A message before they accept needs LinkedIn Premium, Sales Navigator, or Recruiter, and this account will not send it.";
  }
  return "LinkedIn level has not been checked yet. Refresh accounts.";
}

export function stepRequirement(input: {
  action: string;
  followsConnection: boolean;
  plan: string | null | undefined;
}): { need: string; blocked: string | null } {
  if (input.action === "connection") {
    return { need: "Needs a normal LinkedIn account.", blocked: null };
  }
  if (input.followsConnection) {
    return { need: "Needs a normal LinkedIn account. Sends after they accept.", blocked: null };
  }
  const blocked = canMessageBeforeAccept(input.plan)
    ? null
    : "This step will not send on this account. It needs LinkedIn Premium, Sales Navigator, or Recruiter.";
  return { need: "Needs LinkedIn Premium, Sales Navigator, or Recruiter.", blocked };
}

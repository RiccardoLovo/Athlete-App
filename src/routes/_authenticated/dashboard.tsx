import { createFileRoute } from "@tanstack/react-router";
import { AthleteDashboard } from "@/features/dashboard/AthleteDashboard";

type DashboardSearch = {
  /** Look at a plan other than the active one (from My Plans). */
  plan?: string;
  /** Open at this block's first week. */
  block?: string;
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  // Hand-written rather than schema-validated: two optional ids, and an
  // unparseable one simply falls back to the active plan.
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    plan: typeof search.plan === "string" ? search.plan : undefined,
    block: typeof search.block === "string" ? search.block : undefined,
  }),
  component: AthleteDashboard,
});

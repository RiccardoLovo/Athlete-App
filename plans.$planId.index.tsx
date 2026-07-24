import { createFileRoute } from "@tanstack/react-router";
import { PlanDetailPage } from "@/features/plans/PlanDetailPage";

export const Route = createFileRoute("/_authenticated/plans/$planId/")({
  component: PlanDetailPage,
});

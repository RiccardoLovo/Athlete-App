import { createFileRoute } from "@tanstack/react-router";
import { AthleteDashboard } from "@/features/dashboard/AthleteDashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: AthleteDashboard,
});

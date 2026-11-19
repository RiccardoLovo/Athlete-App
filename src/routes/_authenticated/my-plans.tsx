import { createFileRoute } from "@tanstack/react-router";
import { MyPlans } from "@/features/dashboard/MyPlans";

export const Route = createFileRoute("/_authenticated/my-plans")({
  component: MyPlans,
});

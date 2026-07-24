import { createFileRoute } from "@tanstack/react-router";
import { BlockDetailPage } from "@/features/plans/BlockDetailPage";

export const Route = createFileRoute(
  "/_authenticated/plans/$planId/blocks/$blockId",
)({
  component: BlockDetailPage,
});

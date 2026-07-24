import { createFileRoute } from "@tanstack/react-router";
import { BuilderPage } from "@/features/builder/BuilderPage";

export const Route = createFileRoute("/_authenticated/builder/$sessionId")({
  component: BuilderPage,
});

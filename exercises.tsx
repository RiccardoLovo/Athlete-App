import { createFileRoute } from "@tanstack/react-router";
import { ExercisesPage } from "@/features/exercises/ExercisesPage";

export const Route = createFileRoute("/_authenticated/exercises")({
  component: ExercisesPage,
});

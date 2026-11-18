import { createFileRoute, redirect } from "@tanstack/react-router";

// 1RMs now live alongside the rest of the athlete's numbers on My stats.
// The old address is kept so any saved link or bookmark still lands
// somewhere useful rather than on a blank page.
export const Route = createFileRoute("/_authenticated/my-1rm")({
  beforeLoad: () => {
    throw redirect({ to: "/my-stats", replace: true });
  },
});

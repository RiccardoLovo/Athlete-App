import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRole } from "@/hooks/use-role";
import { CoachFeedback } from "@/features/feedback/CoachFeedback";
import { MyFeedback } from "@/features/feedback/MyFeedback";

export const Route = createFileRoute("/_authenticated/feedback")({
  head: () => ({
    meta: [
      { title: "CoachDesk Feedback — Log training sessions" },
      {
        name: "description",
        content:
          "Review past training sessions, record workout feedback, and share effort notes with your coach.",
      },
      {
        property: "og:title",
        content: "CoachDesk Feedback — Log training sessions",
      },
      {
        property: "og:description",
        content:
          "Review past training sessions, record workout feedback, and share effort notes with your coach.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FeedbackRoute,
});

function FeedbackRoute() {
  const { data: role, isLoading } = useRole();
  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  const hasClient = !!role?.hasClientProfile;
  const isCoach = !!role?.isCoach;
  if (hasClient && isCoach) {
    return (
      <div className="h-[calc(100vh-3.5rem)] overflow-auto">
        <div className="mx-auto max-w-[1000px] p-6">
          <Tabs defaultValue="mine">
            <TabsList className="mb-4">
              <TabsTrigger value="mine">My Feedback</TabsTrigger>
              <TabsTrigger value="clients">Client Feedback</TabsTrigger>
            </TabsList>
            <TabsContent value="mine">
              <MyFeedback />
            </TabsContent>
            <TabsContent value="clients">
              <CoachFeedback embedded />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }
  if (hasClient) return <MyFeedback wrap />;
  return <CoachFeedback />;
}

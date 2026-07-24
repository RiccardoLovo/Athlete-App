import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/coachdesk/Navbar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Use getSession() (reads from localStorage synchronously) instead of
  // getUser() (network round-trip to Supabase Auth). getUser was firing on
  // EVERY navigation between protected routes and adding 100–500ms of
  // network latency to each page change — exactly the "feels like it's
  // refreshing twice" symptom. RLS still enforces real auth on every query.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: Layout,
});

function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

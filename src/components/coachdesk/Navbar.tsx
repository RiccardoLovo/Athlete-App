import { Link, useNavigate } from "@tanstack/react-router";
import {
  Dumbbell,
  Users,
  MessageSquare,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/use-role";
import { useTheme } from "@/lib/theme";
import { useMyUnloggedCount } from "@/features/feedback/useMyPastSessions";

function NavLink({
  to,
  icon: Icon,
  label,
  badge,
}: {
  to: string;
  icon: any;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      title={label}
      className="relative inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
      activeProps={{ className: "bg-primary/10 text-primary" }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
      {badge ? (
        <Badge className="ml-0.5 bg-red-600 text-white sm:ml-1">{badge}</Badge>
      ) : null}
    </Link>
  );
}

export function Navbar() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: role } = useRole();
  const isAthlete = !!role?.isAthlete;
  const isAdmin = !!role?.isAdmin;
  const hasClientProfile = !!role?.hasClientProfile;
  const showAthleteLinks = isAthlete || hasClientProfile;
  const showCoachLinks = !isAthlete; // admins/coaches keep coach links
  // Mixed coach+athlete accounts already reach both feedback views via the
  // coach "Feedback" link (it shows a My/Client tabs page) — a second nav
  // entry there would just be a duplicate link to the same route.
  const showAthleteFeedbackLink = showAthleteLinks && !showCoachLinks;
  const unloggedCount = useMyUnloggedCount(showAthleteFeedbackLink);
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending-feedback-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("workout_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
    refetchInterval: 30_000,
    enabled: !isAthlete,
  });

  async function signOut() {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const { theme, setTheme, resolved } = useTheme();
  function cycleTheme() {
    setTheme(
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light",
    );
  }
  const ThemeIcon =
    theme === "system" ? Monitor : resolved === "dark" ? Moon : Sun;
  const themeLabel =
    theme === "system"
      ? "System theme"
      : resolved === "dark"
        ? "Dark mode"
        : "Light mode";

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-1 px-2 sm:gap-2 sm:px-4">
        <Link
          to={isAthlete ? "/dashboard" : "/clients"}
          className="mr-1 shrink-0 text-base font-bold text-primary sm:mr-4 sm:text-lg"
        >
          CoachDesk
        </Link>
        {isAdmin && (
          <Badge className="ml-1 hidden bg-foreground text-background hover:bg-foreground sm:inline-flex">
            Admin
          </Badge>
        )}
        <nav className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          {showCoachLinks && (
            <>
              <NavLink to="/exercises" icon={Dumbbell} label="Knowledge Bank" />
              <NavLink to="/clients" icon={Users} label="Clients" />
              <NavLink
                to="/feedback"
                icon={MessageSquare}
                label="Feedback"
                badge={pendingCount}
              />
            </>
          )}
          {showAthleteLinks && (
            <>
              <NavLink to="/dashboard" icon={Dumbbell} label="My Training" />
              {showAthleteFeedbackLink && (
                <NavLink
                  to="/feedback"
                  icon={MessageSquare}
                  label="My Feedback"
                  badge={unloggedCount}
                />
              )}
              <NavLink to="/my-1rm" icon={Activity} label="My 1RMs" />
            </>
          )}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={cycleTheme}
            title={`${themeLabel} — click to change`}
            aria-label="Toggle theme"
          >
            <ThemeIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

import { Link, useNavigate } from "@tanstack/react-router";
import { Dumbbell, Users, MessageSquare, LogOut, Sun, Moon, Monitor, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/hooks/use-role";
import { useTheme } from "@/lib/theme";

function NavLink({ to, icon: Icon, label, badge }: { to: string; icon: any; label: string; badge?: number }) {
  return (
    <Link
      to={to}
      className="relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      activeProps={{ className: "bg-primary/10 text-primary" }}
    >
      <Icon className="h-4 w-4" />
      {label}
      {badge ? (
        <Badge className="ml-1 bg-red-600 text-white">{badge}</Badge>
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
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const { theme, setTheme, resolved } = useTheme();
  function cycleTheme() {
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  }
  const ThemeIcon = theme === "system" ? Monitor : resolved === "dark" ? Moon : Sun;
  const themeLabel = theme === "system" ? "System theme" : resolved === "dark" ? "Dark mode" : "Light mode";

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4">
        <Link to={isAthlete ? "/dashboard" : "/exercises"} className="mr-4 text-lg font-bold text-primary">
          CoachDesk
        </Link>
        {isAdmin && (
          <Badge className="ml-1 bg-amber-500 text-white hover:bg-amber-500">Admin</Badge>
        )}
        <nav className="flex items-center gap-1">
          {showCoachLinks && (
            <>
              <NavLink to="/exercises" icon={Dumbbell} label="Knowledge Bank" />
              <NavLink to="/clients" icon={Users} label="Clients" />
              <NavLink to="/feedback" icon={MessageSquare} label="Feedback" badge={pendingCount} />
            </>
          )}
          {showAthleteLinks && (
            <>
              <NavLink to="/dashboard" icon={Dumbbell} label="My Training" />
              <NavLink to="/my-1rm" icon={Activity} label="My 1RMs" />
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={cycleTheme}
            title={`${themeLabel} — click to change`}
            aria-label="Toggle theme"
          >
            <ThemeIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
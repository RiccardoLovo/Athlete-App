import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  UserCircle,
  Link2,
  Copy,
  Check,
  Dumbbell,
  LineChart,
  Bell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { SPORTS } from "@/lib/coachdesk/constants";
import { OneRmDialog } from "@/components/coachdesk/OneRmDialog";
import { useRole } from "@/hooks/use-role";
import {
  addDays,
  parseISODate,
  toISODate,
} from "@/lib/coachdesk/periodization";
import { clientWithPlansQuery } from "@/lib/coachdesk/client-queries";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsPage,
});

type Client = {
  id: string;
  name: string;
  email: string;
  sport: string;
  goal: string;
  notes: string;
  status: string;
  coach_id: string;
};
type Coach = { id: string; name: string };
type ClientTrainingStatus = {
  missing: number;
  pendingCount: number;
  pendingId: string | null;
};
type BlockRow = { id: string; position: number; weeks: number };
type PlanRow = {
  athlete_id: string;
  start_date: string;
  training_blocks: BlockRow[] | null;
};
type SessionRow = {
  id: string;
  day_of_week: number;
  week_number: number;
  block_id: string;
};
type LogRow = {
  id: string;
  client_id: string;
  session_id: string;
  status: string;
};

// A client is "on track" when every active, non-optional session on or before
// today (that actually has exercises assigned) has a matching workout_log. The bell
// separately flags feedback the coach hasn't reviewed yet (status="pending").
function useClientsTrainingStatus(clientIds: string[]) {
  return useQuery({
    queryKey: ["clients-training-status", clientIds],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data: plans } = await supabase
        .from("training_plans")
        .select("athlete_id, start_date, training_blocks(id, position, weeks)")
        .in("athlete_id", clientIds);
      const planRows = (plans ?? []) as unknown as PlanRow[];
      const blockIds = planRows.flatMap((p) =>
        (p.training_blocks ?? []).map((b) => b.id),
      );

      // Optional sessions are excluded outright: skipping one is a legitimate
      // choice, so it must not make the athlete look behind.
      const { data: sessRows } = blockIds.length
        ? await supabase
            .from("sessions")
            .select("id, day_of_week, week_number, block_id")
            .in("block_id", blockIds)
            .eq("status", "active")
            .eq("is_optional", false)
        : { data: [] as SessionRow[] };
      const sessions = (sessRows ?? []) as SessionRow[];
      const sessionIds = sessions.map((s) => s.id);

      const [{ data: exRows }, { data: logRows }] = await Promise.all([
        sessionIds.length
          ? supabase
              .from("session_exercises")
              .select("session_id")
              .in("session_id", sessionIds)
          : Promise.resolve({ data: [] as { session_id: string }[] }),
        supabase
          .from("workout_logs")
          .select("id, client_id, session_id, status")
          .in("client_id", clientIds),
      ]);
      const hasExercises = new Set((exRows ?? []).map((e) => e.session_id));
      const loggedKeys = new Set<string>();
      const result = new Map<string, ClientTrainingStatus>(
        clientIds.map((id) => [
          id,
          { missing: 0, pendingCount: 0, pendingId: null },
        ]),
      );
      for (const l of (logRows ?? []) as LogRow[]) {
        loggedKeys.add(`${l.client_id}:${l.session_id}`);
        if (l.status === "pending") {
          const s = result.get(l.client_id);
          if (s) {
            s.pendingCount += 1;
            s.pendingId = l.id;
          }
        }
      }

      const todayISO = toISODate(new Date());
      for (const plan of planRows) {
        const clientId = plan.athlete_id;
        const status = result.get(clientId);
        if (!status) continue;
        const blocks = (plan.training_blocks ?? [])
          .slice()
          .sort((a, b) => a.position - b.position);
        if (!blocks.length) continue;
        const offsets = new Map<string, number>();
        let cum = 0;
        for (const b of blocks) {
          offsets.set(b.id, cum);
          cum += b.weeks * 7;
        }
        const blockIdSet = new Set(blocks.map((b) => b.id));
        for (const s of sessions) {
          if (!blockIdSet.has(s.block_id) || !hasExercises.has(s.id)) continue;
          const off =
            (offsets.get(s.block_id) ?? 0) +
            (s.week_number - 1) * 7 +
            (s.day_of_week - 1);
          const planned = toISODate(
            addDays(parseISODate(plan.start_date), off),
          );
          if (planned > todayISO) continue;
          if (!loggedKeys.has(`${clientId}:${s.id}`)) status.missing += 1;
        }
      }
      return result;
    },
  });
}

function ClientsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: role } = useRole();
  const isAdmin = !!role?.isAdmin;
  const [editing, setEditing] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [inviteFor, setInviteFor] = useState<Client | null>(null);
  const [oneRmFor, setOneRmFor] = useState<Client | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: coaches = [] } = useQuery({
    queryKey: ["coaches-directory"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("coaches")
        .select("id, name")
        .order("name");
      return (data ?? []) as Coach[];
    },
  });

  const coachNameById = new Map(coaches.map((c) => [c.id, c.name]));
  const { data: trainingStatus } = useClientsTrainingStatus(
    clients.map((c) => c.id),
  );

  // Prefetch the merged client+plans query on hover/focus so the detail
  // page is often already warm by the time the click lands — each request
  // has a fixed ~700-900ms floor, so this is the difference between a
  // visible freeze and an instant navigation for anyone who doesn't
  // double-click.
  function prefetchClient(id: string) {
    qc.prefetchQuery(clientWithPlansQuery(id));
  }

  async function deleteOne(id: string) {
    if (!confirm("Delete this client and all their training data?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["clients"] });
    }
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-[1200px] p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Clients</h1>
            {isAdmin && (
              <p className="text-xs text-muted-foreground">
                Admin view — showing clients across every coach.
              </p>
            )}
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> New Client
          </Button>
        </div>
        {clients.length === 0 ? (
          <div className="py-20 text-center">
            <UserCircle className="mx-auto h-16 w-16 text-muted-foreground/40" />
            <p className="mt-2 text-muted-foreground">
              No clients yet. Add your first one!
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {clients.map((c) => (
              <Link
                key={c.id}
                to="/clients/$clientId"
                params={{ clientId: c.id }}
                onMouseEnter={() => prefetchClient(c.id)}
                onFocus={() => prefetchClient(c.id)}
                onTouchStart={() => prefetchClient(c.id)}
              >
                <Card className="group relative p-5 transition-shadow hover:shadow-md">
                  <div className="absolute right-3 top-3 flex gap-1 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditing(c);
                        setShowForm(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Invite athlete"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setInviteFor(c);
                      }}
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="1RM dashboard"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOneRmFor(c);
                      }}
                    >
                      <Dumbbell className="h-4 w-4" />
                    </Button>
                    <Link
                      to="/analytics/$clientId"
                      params={{ clientId: c.id }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Progress / analytics"
                      >
                        <LineChart className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteOne(c.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{c.name}</h3>
                    {!!trainingStatus?.get(c.id)?.pendingCount && (
                      <button
                        type="button"
                        title={`${trainingStatus.get(c.id)!.pendingCount} feedback awaiting review`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate({
                            to: "/feedback",
                            search: { clientId: c.id },
                          });
                        }}
                        className="relative inline-flex items-center justify-center rounded-full p-1 text-amber-600 hover:bg-amber-100"
                      >
                        <Bell className="h-4 w-4" />
                        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">
                          {trainingStatus.get(c.id)!.pendingCount}
                        </span>
                      </button>
                    )}
                  </div>
                  {isAdmin && (
                    <p className="text-xs text-muted-foreground">
                      Coach: {coachNameById.get(c.coach_id) ?? "—"}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(() => {
                      const missing = trainingStatus?.get(c.id)?.missing ?? 0;
                      return missing > 0 ? (
                        <Badge className="bg-red-600 text-white hover:bg-red-600">
                          Behind — {missing} session{missing === 1 ? "" : "s"}
                        </Badge>
                      ) : (
                        <Badge className="bg-foreground text-background hover:bg-foreground">
                          On track
                        </Badge>
                      );
                    })()}
                    {c.sport && <Badge variant="secondary">{c.sport}</Badge>}
                    {c.goal && <Badge variant="outline">{c.goal}</Badge>}
                  </div>
                  {c.notes && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {c.notes}
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
      {showForm && (
        <ClientFormModal
          initial={editing}
          isAdmin={isAdmin}
          coaches={coaches}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["clients"] });
          }}
        />
      )}
      {inviteFor && (
        <InviteModal client={inviteFor} onClose={() => setInviteFor(null)} />
      )}
      {oneRmFor && (
        <OneRmDialog
          clientId={oneRmFor.id}
          clientName={oneRmFor.name}
          onClose={() => setOneRmFor(null)}
        />
      )}
    </div>
  );
}

function InviteModal({
  client,
  onClose,
}: {
  client: Client;
  onClose: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("client_invites")
      .insert({ coach_id: u.user.id, client_id: client.id })
      .select("token")
      .single();
    setLoading(false);
    if (error || !data)
      return toast.error(error?.message ?? "Failed to create invite");
    setToken(data.token);
  }

  const url = token
    ? `${window.location.origin}/invite/${encodeURIComponent(token)}`
    : "";

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite {client.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <p className="text-muted-foreground">
            Generate a one-time signup link for this athlete. Send it to them —
            only with this link can they create an account linked to you.
          </p>
          {!token ? (
            <Button onClick={generate} disabled={loading} className="w-full">
              {loading ? "Generating…" : "Generate invite link"}
            </Button>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Personal signup link</Label>
              <div className="flex gap-2">
                <Input readOnly value={url} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copy}>
                  {copied ? (
                    <Check className="h-4 w-4 text-foreground" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this with {client.name}. It can only be used once.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientFormModal({
  initial,
  isAdmin,
  coaches,
  onClose,
  onSaved,
}: {
  initial: Client | null;
  isAdmin: boolean;
  coaches: Coach[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    sport: initial?.sport ?? "General",
    goal: initial?.goal ?? "",
    notes: initial?.notes ?? "",
  });
  // For admins creating a brand-new client, they may need to pick which coach owns it.
  const [coachId, setCoachId] = useState<string>(initial?.coach_id ?? "");
  async function save() {
    if (!form.name.trim()) return toast.error("Name required");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (initial) {
      const { error } = await supabase
        .from("clients")
        .update(form)
        .eq("id", initial.id);
      if (error) return toast.error(error.message);
    } else {
      // Determine owning coach.
      let ownerCoachId = u.user.id;
      if (isAdmin) {
        // If signed-in admin is also a coach themselves, default to them; otherwise the picker is required.
        const adminIsCoach = coaches.some((c) => c.id === u.user!.id);
        if (coachId) ownerCoachId = coachId;
        else if (adminIsCoach) ownerCoachId = u.user.id;
        else return toast.error("Pick which coach owns this client");
      }
      const { error } = await supabase.from("clients").insert({
        ...form,
        coach_id: ownerCoachId,
        start_date: new Date().toISOString().slice(0, 10),
      });
      if (error) return toast.error(error.message);
    }
    toast.success("Saved");
    onSaved();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Client" : "New Client"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {isAdmin && !initial && (
            <div className="space-y-2">
              <Label>
                Owning coach{" "}
                {coaches.length === 0 ? "(no coaches available yet)" : ""}
              </Label>
              <Select value={coachId} onValueChange={setCoachId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select coach" />
                </SelectTrigger>
                <SelectContent>
                  {coaches.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                As admin you can assign this client to any coach.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Sport</Label>
            <Select
              value={form.sport}
              onValueChange={(v) => setForm({ ...form, sport: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Goal</Label>
            <Input
              placeholder="e.g. Half Marathon PB"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              placeholder="Injuries, preferences…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

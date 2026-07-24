import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, UserCircle, Link2, Copy, Check, Dumbbell, LineChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { SPORTS } from "@/lib/coachdesk/constants";
import { OneRmDialog } from "@/components/coachdesk/OneRmDialog";
import { useRole } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsPage,
});

type Client = { id: string; name: string; email: string; sport: string; goal: string; notes: string; status: string; coach_id: string; };
type Coach = { id: string; name: string };

function ClientsPage() {
  const qc = useQueryClient();
  const { data: role } = useRole();
  const isAdmin = !!role?.isAdmin;
  const [editing, setEditing] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [inviteFor, setInviteFor] = useState<Client | null>(null);
  const [oneRmFor, setOneRmFor] = useState<Client | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: coaches = [] } = useQuery({
    queryKey: ["coaches-directory"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("coaches").select("id, name").order("name");
      return (data ?? []) as Coach[];
    },
  });

  const coachNameById = new Map(coaches.map((c) => [c.id, c.name]));

  async function deleteOne(id: string) {
    if (!confirm("Delete this client and all their training data?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["clients"] }); }
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-[1200px] p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Clients</h1>
            {isAdmin && (
              <p className="text-xs text-muted-foreground">Admin view — showing clients across every coach.</p>
            )}
          </div>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="mr-1 h-4 w-4" /> New Client
          </Button>
        </div>
        {clients.length === 0 ? (
          <div className="py-20 text-center">
            <UserCircle className="mx-auto h-16 w-16 text-muted-foreground/40" />
            <p className="mt-2 text-muted-foreground">No clients yet. Add your first one!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {clients.map((c) => (
              <Link
                key={c.id}
                to="/clients/$clientId"
                params={{ clientId: c.id }}
              >
                <Card className="group relative p-5 transition-shadow hover:shadow-md">
                  <div className="absolute right-3 top-3 flex gap-1 opacity-0 group-hover:opacity-100">
                    <Button variant="ghost" size="icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(c); setShowForm(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Invite athlete" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInviteFor(c); }}>
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="1RM dashboard" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOneRmFor(c); }}>
                      <Dumbbell className="h-4 w-4" />
                    </Button>
                    <Link to="/analytics/$clientId" params={{ clientId: c.id }} onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" title="Progress / analytics">
                        <LineChart className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteOne(c.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <h3 className="text-lg font-semibold">{c.name}</h3>
                  {isAdmin && (
                    <p className="text-xs text-muted-foreground">
                      Coach: {coachNameById.get(c.coach_id) ?? "—"}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.sport && <Badge variant="secondary">{c.sport}</Badge>}
                    {c.goal && <Badge variant="outline">{c.goal}</Badge>}
                  </div>
                  {c.notes && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.notes}</p>}
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
          onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["clients"] }); }}
        />
      )}
      {inviteFor && (
        <InviteModal client={inviteFor} onClose={() => setInviteFor(null)} />
      )}
      {oneRmFor && (
        <OneRmDialog clientId={oneRmFor.id} clientName={oneRmFor.name} onClose={() => setOneRmFor(null)} />
      )}
    </div>
  );
}

function InviteModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("client_invites")
      .insert({ coach_id: u.user.id, client_id: client.id })
      .select("token")
      .single();
    setLoading(false);
    if (error || !data) return toast.error(error?.message ?? "Failed to create invite");
    setToken(data.token);
  }

  const url = token ? `${window.location.origin}/invite/${encodeURIComponent(token)}` : "";

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite {client.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <p className="text-muted-foreground">
            Generate a one-time signup link for this athlete. Send it to them — only with this link can they create an account linked to you.
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
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this with {client.name}. It can only be used once.
              </p>
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientFormModal({ initial, isAdmin, coaches, onClose, onSaved }: { initial: Client | null; isAdmin: boolean; coaches: Coach[]; onClose: () => void; onSaved: () => void; }) {
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
      const { error } = await supabase.from("clients").update(form).eq("id", initial.id);
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
      const { error } = await supabase.from("clients").insert({ ...form, coach_id: ownerCoachId, start_date: new Date().toISOString().slice(0, 10) });
      if (error) return toast.error(error.message);
    }
    toast.success("Saved");
    onSaved();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Edit Client" : "New Client"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {isAdmin && !initial && (
            <div className="space-y-2">
              <Label>Owning coach {coaches.length === 0 ? "(no coaches available yet)" : ""}</Label>
              <Select value={coachId} onValueChange={setCoachId}>
                <SelectTrigger><SelectValue placeholder="Select coach" /></SelectTrigger>
                <SelectContent>
                  {coaches.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">As admin you can assign this client to any coach.</p>
            </div>
          )}
          <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-2"><Label>Sport</Label>
            <Select value={form.sport} onValueChange={(v) => setForm({ ...form, sport: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SPORTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Goal</Label><Input placeholder="e.g. Half Marathon PB" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea rows={3} placeholder="Injuries, preferences…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
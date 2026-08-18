import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, UserCircle } from "lucide-react";
import { ClientProfileDialog } from "@/components/coachdesk/ClientProfileDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  nextMonday,
  toISODate,
  planEnd,
  formatRange,
  parseISODate,
  isBetween,
} from "@/lib/coachdesk/periodization";
import {
  clientWithPlansQuery,
  type ClientPlan,
} from "@/lib/coachdesk/client-queries";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  component: ClientDetailPage,
});

type PlanStatus = "draft" | "active" | "completed";
type Plan = ClientPlan;

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const { data: clientWithPlans } = useQuery(clientWithPlansQuery(clientId));
  const client = clientWithPlans;
  const plans = clientWithPlans?.training_plans ?? [];

  const today = new Date();

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/clients" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{client?.name ?? "…"}</h1>
            <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
              {client?.sport && (
                <Badge variant="secondary">{client.sport}</Badge>
              )}
              {client?.goal && <Badge variant="outline">{client.goal}</Badge>}
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowProfile(true)}>
            <UserCircle className="mr-1 h-4 w-4" /> Profile
          </Button>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Plans</h2>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-1 h-4 w-4" /> Create New Plan
            </Button>
          </div>
          {plans.length === 0 ? (
            <Card className="py-16 text-center text-sm text-muted-foreground">
              No plans yet — create one to start programming.
            </Card>
          ) : (
            <div className="space-y-3">
              {plans.map((p) => {
                const totalWeeks = p.training_blocks.reduce(
                  (s, b) => s + b.weeks,
                  0,
                );
                const start = parseISODate(p.start_date);
                const end = planEnd(p.start_date, p.training_blocks);
                const isPast = end < today && !isBetween(today, start, end);
                const isActive = p.status === "active";
                return (
                  <Link
                    key={p.id}
                    to="/plans/$planId"
                    params={{ planId: p.id }}
                  >
                    <Card
                      className={`p-4 transition-shadow hover:shadow ${isActive ? "border-primary" : ""} ${isPast ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{p.name}</h3>
                            <StatusBadge status={p.status} />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatRange(start, end)} ·{" "}
                            {p.training_blocks.length} block
                            {p.training_blocks.length === 1 ? "" : "s"} ·{" "}
                            {totalWeeks} week{totalWeeks === 1 ? "" : "s"}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {showProfile && client && (
        <ClientProfileDialog
          clientId={clientId}
          coachId={client.coach_id}
          clientName={client.name}
          onClose={() => setShowProfile(false)}
        />
      )}

      {showForm && client && (
        <PlanFormModal
          clientId={clientId}
          coachId={client.coach_id}
          existingPlans={plans}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["client-with-plans", clientId] });
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PlanStatus }) {
  const cls =
    status === "active"
      ? "bg-emerald-100 text-emerald-800"
      : status === "completed"
        ? "bg-slate-200 text-slate-700"
        : "bg-amber-100 text-amber-800";
  return (
    <Badge className={cls}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function PlanFormModal({
  clientId,
  coachId,
  existingPlans,
  onClose,
  onSaved,
}: {
  clientId: string;
  coachId: string;
  existingPlans: Plan[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(toISODate(nextMonday()));
  const [status, setStatus] = useState<PlanStatus>("draft");
  const [error, setError] = useState<string | null>(null);

  function checkOverlap(): string | null {
    // New plan with no blocks yet has zero length — never overlaps. Validate anyway after creating first block.
    const startD = parseISODate(startDate);
    for (const p of existingPlans) {
      const otherStart = parseISODate(p.start_date);
      const otherEnd = planEnd(p.start_date, p.training_blocks);
      if (startD >= otherStart && startD <= otherEnd) {
        return `Overlaps with "${p.name}" (${formatRange(otherStart, otherEnd)}).`;
      }
    }
    return null;
  }

  async function save() {
    if (!name.trim()) return setError("Name is required");
    const o = checkOverlap();
    if (o) return setError(o);
    const { data, error: err } = await supabase
      .from("training_plans")
      .insert({
        name: name.trim(),
        start_date: startDate,
        status,
        athlete_id: clientId,
        coach_id: coachId,
      })
      .select("id")
      .single();
    if (err) return setError(err.message);
    toast.success("Plan created");
    onSaved();
    // Optional: navigate to new plan — caller decides.
    void data;
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              placeholder="e.g. Off-Season Strength"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Start Date * (Monday)</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as PlanStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

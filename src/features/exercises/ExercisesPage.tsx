import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, X, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { useRole } from "@/hooks/use-role";

function TemplateDefaultInput({
  k,
  label,
  v,
  setV,
}: {
  k: string;
  label: string;
  v: Record<string, number | string>;
  setV: React.Dispatch<React.SetStateAction<Record<string, number | string>>>;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      <Input
        className="h-8"
        type="number"
        value={String(v[k] ?? "")}
        onChange={(e) =>
          setV((p) => ({
            ...p,
            [k]: e.target.value === "" ? "" : Number(e.target.value),
          }))
        }
      />
    </div>
  );
}

export const DISCIPLINES = [
  "Strength",
  "Running",
  "Swimming",
  "Cycling",
  "Sport-Specific",
  "Mobility",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const CATEGORIES = [
  "Resistance",
  "Cardio",
  "Mobility",
  "Plyometric",
  "Activation",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const BODY_REGIONS = [
  "Upper Body",
  "Lower Body",
  "Full Body",
  "Core",
] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

export const STROKES = [
  "Freestyle",
  "Backstroke",
  "Breaststroke",
  "Butterfly",
  "IM",
] as const;

export function needsBodyRegion(d: Discipline): boolean {
  return d === "Strength" || d === "Sport-Specific" || d === "Mobility";
}

const DISCIPLINE_COLOR: Record<Discipline, string> = {
  Strength:
    "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  Running:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  Swimming:
    "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  Cycling:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  "Sport-Specific":
    "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  Mobility:
    "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
};

const CATEGORY_COLOR: Record<Category, string> = {
  Resistance:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30",
  Cardio:
    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
  Mobility:
    "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
  Plyometric:
    "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
  Activation:
    "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30",
};

type Exercise = {
  id: string;
  name_it: string;
  name_en: string;
  discipline: Discipline;
  category: Category;
  body_region: BodyRegion | null;
  muscle_group: string | null;
  stroke_default: string | null;
  sport_tag: string | null;
  description_it: string | null;
  description_en: string | null;
  video_url: string | null;
  is_global: boolean;
  created_by: string | null;
  structure_type: "simple" | "intervals" | "template";
  template_type: "rsa" | "pyramid" | null;
  template_defaults: Record<string, unknown> | null;
};

export function ExercisesPage() {
  const qc = useQueryClient();
  const { data: role } = useRole();
  const isAdmin = !!role?.isAdmin;
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState<"All" | Discipline>("All");
  const [fCategory, setFCategory] = useState<string>("");
  const [fRegion, setFRegion] = useState<string>("");
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .order("name_en");
      if (error) throw error;
      return (data ?? []) as unknown as Exercise[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return exercises.filter((e) => {
      if (discipline !== "All" && e.discipline !== discipline) return false;
      if (fCategory && e.category !== fCategory) return false;
      if (fRegion && e.body_region !== fRegion) return false;
      if (s) {
        if (
          !e.name_en.toLowerCase().includes(s) &&
          !e.name_it.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [exercises, search, discipline, fCategory, fRegion]);

  const showRegionFilter =
    discipline === "Strength" ||
    discipline === "Sport-Specific" ||
    discipline === "Mobility";

  async function deleteOne(e: Exercise) {
    if (e.is_global && !isAdmin) {
      toast.error("Built-in exercises can't be deleted");
      return;
    }
    if (!confirm(`Delete "${e.name_en}"?`)) return;
    const { error } = await supabase.from("exercises").delete().eq("id", e.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["exercises"] });
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b bg-card p-4">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search (Italian or English)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={fCategory || "_all"}
            onValueChange={(v) => setFCategory(v === "_all" ? "" : v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showRegionFilter && (
            <Select
              value={fRegion || "_all"}
              onValueChange={(v) => setFRegion(v === "_all" ? "" : v)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Body region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All regions</SelectItem>
                {BODY_REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(fCategory || fRegion) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFCategory("");
                setFRegion("");
              }}
            >
              <X className="mr-1 h-4 w-4" /> Clear
            </Button>
          )}
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add Exercise
          </Button>
        </div>
        <div className="mx-auto mt-3 flex max-w-[1400px] flex-wrap gap-1.5">
          {(["All", ...DISCIPLINES] as const).map((d) => {
            const active = discipline === d;
            return (
              <button
                key={d}
                onClick={() => {
                  setDiscipline(d);
                  if (d === "Running" || d === "Swimming" || d === "Cycling")
                    setFRegion("");
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] space-y-2 p-4">
          {filtered.map((e) => (
            <Card key={e.id} className="flex items-start gap-3 p-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{e.name_en}</h3>
                  <span className="text-xs text-muted-foreground italic">
                    {e.name_it}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${DISCIPLINE_COLOR[e.discipline]}`}
                  >
                    {e.discipline}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLOR[e.category]}`}
                  >
                    {e.category}
                  </span>
                  {e.body_region && (
                    <span className="rounded-full border bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-50 dark:bg-slate-100 dark:text-slate-900">
                      {e.body_region}
                    </span>
                  )}
                  {e.discipline === "Strength" && e.muscle_group && (
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                      {e.muscle_group}
                    </span>
                  )}
                  {e.discipline === "Swimming" && e.stroke_default && (
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                      {e.stroke_default}
                    </span>
                  )}
                  {e.discipline === "Sport-Specific" && e.sport_tag && (
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                      {e.sport_tag}
                    </span>
                  )}
                  {e.is_global && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      <Lock className="h-3 w-3" /> Built-in
                    </span>
                  )}
                  {e.structure_type === "intervals" && (
                    <span className="rounded-full border border-indigo-300 bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30">
                      Intervals
                    </span>
                  )}
                  {e.structure_type === "template" && (
                    <span className="rounded-full border border-fuchsia-300 bg-fuchsia-100 px-2 py-0.5 text-[10px] font-medium text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30">
                      {e.template_type === "rsa"
                        ? "RSA template"
                        : "Pyramid template"}
                    </span>
                  )}
                </div>
                {(e.description_en || e.description_it) && (
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {e.description_en ?? e.description_it}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={e.is_global && !isAdmin}
                title={
                  e.is_global && !isAdmin
                    ? "Built-in exercises can't be edited"
                    : "Edit"
                }
                onClick={() => {
                  setEditing(e);
                  setShowForm(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={e.is_global && !isAdmin}
                title={
                  e.is_global && !isAdmin
                    ? "Built-in exercises can't be deleted"
                    : "Delete"
                }
                onClick={() => deleteOne(e)}
              >
                <Trash2
                  className={`h-4 w-4 ${e.is_global && !isAdmin ? "text-muted-foreground" : "text-destructive"}`}
                />
              </Button>
            </Card>
          ))}
          {!filtered.length && (
            <p className="py-12 text-center text-muted-foreground">
              No exercises match.
            </p>
          )}
        </div>
      </div>
      <div className="border-t bg-card px-4 py-2 text-xs text-muted-foreground">
        {filtered.length} exercise{filtered.length === 1 ? "" : "s"}
      </div>

      {showForm && (
        <ExerciseFormModal
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["exercises"] });
          }}
        />
      )}
    </div>
  );
}

function ExerciseFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Exercise | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [discipline, setDiscipline] = useState<Discipline>(
    initial?.discipline ?? "Strength",
  );
  type StructureChoice =
    | "simple"
    | "intervals"
    | "template:rsa"
    | "template:pyramid";
  const initialStructure: StructureChoice =
    initial?.structure_type === "template"
      ? initial.template_type === "pyramid"
        ? "template:pyramid"
        : "template:rsa"
      : ((initial?.structure_type ?? "simple") as StructureChoice);
  const [structure, setStructure] = useState<StructureChoice>(initialStructure);
  const [templateDefaults, setTemplateDefaults] = useState<
    Record<string, number | string>
  >((initial?.template_defaults as Record<string, number | string>) ?? {});
  const [form, setForm] = useState({
    name_en: initial?.name_en ?? "",
    name_it: initial?.name_it ?? "",
    category: (initial?.category ?? "Resistance") as Category,
    body_region: (initial?.body_region ?? "Lower Body") as BodyRegion,
    muscle_group: initial?.muscle_group ?? "",
    stroke_default: initial?.stroke_default ?? "Freestyle",
    sport_tag: initial?.sport_tag ?? "",
    description_en: initial?.description_en ?? "",
    description_it: initial?.description_it ?? "",
    video_url: initial?.video_url ?? "",
  });

  const showRegion = needsBodyRegion(discipline);

  async function save() {
    if (!form.name_en.trim() || !form.name_it.trim())
      return toast.error("Both English and Italian names are required");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const payload = {
      name_en: form.name_en.trim(),
      name_it: form.name_it.trim(),
      category: form.category,
      discipline,
      body_region: showRegion ? (form.body_region as string) : null,
      muscle_group:
        discipline === "Strength" ? form.muscle_group.trim() || null : null,
      stroke_default: discipline === "Swimming" ? form.stroke_default : null,
      sport_tag:
        discipline === "Sport-Specific" ? form.sport_tag.trim() || null : null,
      description_en: form.description_en.trim() || null,
      description_it: form.description_it.trim() || null,
      video_url: form.video_url.trim() || null,
      structure_type: structure.startsWith("template") ? "template" : structure,
      template_type:
        structure === "template:rsa"
          ? "rsa"
          : structure === "template:pyramid"
            ? "pyramid"
            : null,
      template_defaults: structure.startsWith("template")
        ? templateDefaults
        : null,
    };

    if (initial) {
      const { error } = await supabase
        .from("exercises")
        .update(payload as never)
        .eq("id", initial.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("exercises").insert({
        ...payload,
        is_global: false,
        created_by: u.user.id,
      } as never);
      if (error) return toast.error(error.message);
    }
    toast.success("Saved");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit Exercise" : "Add Exercise"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-2">
            <Label>Discipline *</Label>
            <Select
              value={discipline}
              onValueChange={(v) => setDiscipline(v as Discipline)}
              disabled={!!initial}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCIPLINES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Category *</Label>
            <Select
              value={form.category}
              onValueChange={(v) =>
                setForm({ ...form, category: v as Category })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Structure</Label>
            <Select
              value={structure}
              onValueChange={(v) => setStructure(v as StructureChoice)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">
                  Simple (one-liner prescription)
                </SelectItem>
                <SelectItem value="intervals">
                  Intervals (custom rows)
                </SelectItem>
                <SelectItem value="template:rsa">Template → RSA</SelectItem>
                <SelectItem value="template:pyramid">
                  Template → Pyramid
                </SelectItem>
              </SelectContent>
            </Select>
            {structure === "template:rsa" && (
              <div className="grid grid-cols-4 gap-2 pt-1">
                <TemplateDefaultInput
                  k="sprint_count"
                  label="Sprints"
                  v={templateDefaults}
                  setV={setTemplateDefaults}
                />
                <TemplateDefaultInput
                  k="sprint_distance_m"
                  label="Dist (m)"
                  v={templateDefaults}
                  setV={setTemplateDefaults}
                />
                <TemplateDefaultInput
                  k="rest_seconds"
                  label="Rest (s)"
                  v={templateDefaults}
                  setV={setTemplateDefaults}
                />
                <div className="space-y-1">
                  <Label className="text-[10px]">Intensity</Label>
                  <Select
                    value={String(templateDefaults.intensity ?? "max")}
                    onValueChange={(v) =>
                      setTemplateDefaults((p) => ({ ...p, intensity: v }))
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["easy", "moderate", "hard", "max"].map((i) => (
                        <SelectItem key={i} value={i}>
                          {i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {structure === "template:pyramid" && (
              <div className="grid grid-cols-4 gap-2 pt-1">
                <TemplateDefaultInput
                  k="start_m"
                  label="Start (m)"
                  v={templateDefaults}
                  setV={setTemplateDefaults}
                />
                <TemplateDefaultInput
                  k="peak_m"
                  label="Peak (m)"
                  v={templateDefaults}
                  setV={setTemplateDefaults}
                />
                <TemplateDefaultInput
                  k="step_m"
                  label="Step (m)"
                  v={templateDefaults}
                  setV={setTemplateDefaults}
                />
                <TemplateDefaultInput
                  k="rest_seconds"
                  label="Rest (s)"
                  v={templateDefaults}
                  setV={setTemplateDefaults}
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Name (English) *</Label>
            <Input
              value={form.name_en}
              onChange={(e) => setForm({ ...form, name_en: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Name (Italian) *</Label>
            <Input
              value={form.name_it}
              onChange={(e) => setForm({ ...form, name_it: e.target.value })}
            />
          </div>
          {showRegion && (
            <div className="space-y-2">
              <Label>Body Region *</Label>
              <Select
                value={form.body_region}
                onValueChange={(v) =>
                  setForm({ ...form, body_region: v as BodyRegion })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BODY_REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {discipline === "Strength" && (
            <div className="space-y-2">
              <Label>Muscle Group</Label>
              <Input
                placeholder="e.g. Quads, Glutes"
                value={form.muscle_group}
                onChange={(e) =>
                  setForm({ ...form, muscle_group: e.target.value })
                }
              />
            </div>
          )}
          {discipline === "Swimming" && (
            <div className="space-y-2">
              <Label>Default Stroke</Label>
              <Select
                value={form.stroke_default}
                onValueChange={(v) => setForm({ ...form, stroke_default: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STROKES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {discipline === "Sport-Specific" && (
            <div className="space-y-2">
              <Label>Sport Tag</Label>
              <Input
                placeholder="e.g. Padel, Football"
                value={form.sport_tag}
                onChange={(e) =>
                  setForm({ ...form, sport_tag: e.target.value })
                }
              />
            </div>
          )}
          <div className="col-span-2 space-y-2">
            <Label>Description (English)</Label>
            <Textarea
              rows={2}
              value={form.description_en}
              onChange={(e) =>
                setForm({ ...form, description_en: e.target.value })
              }
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Description (Italian)</Label>
            <Textarea
              rows={2}
              value={form.description_it}
              onChange={(e) =>
                setForm({ ...form, description_it: e.target.value })
              }
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Video URL</Label>
            <Input
              placeholder="https://…"
              value={form.video_url}
              onChange={(e) => setForm({ ...form, video_url: e.target.value })}
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

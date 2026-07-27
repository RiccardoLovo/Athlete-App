import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  User,
  Upload,
  Trash2,
  FileText,
  Image as ImageIcon,
  Download,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type WeightLog = { id: string; value_kg: number; logged_at: string };
type Attachment = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_AVATAR_MB = 5;
const MAX_ATTACHMENT_MB = 25;

export function ClientProfileDialog({
  clientId,
  coachId,
  clientName,
  onClose,
}: {
  clientId: string;
  coachId: string;
  clientName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [weightValue, setWeightValue] = useState("");
  const [weightDate, setWeightDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const { data: client } = useQuery({
    queryKey: ["client-profile", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, avatar_path, height_cm")
        .eq("id", clientId)
        .single();
      return data as {
        id: string;
        avatar_path: string | null;
        height_cm: number | null;
      };
    },
  });

  const { data: avatarUrl } = useQuery({
    queryKey: ["client-avatar-url", client?.avatar_path],
    enabled: !!client?.avatar_path,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("client-avatars")
        .createSignedUrl(client!.avatar_path!, 3600);
      if (error) return null;
      return data.signedUrl;
    },
  });

  const { data: weightLogs = [] } = useQuery({
    queryKey: ["client-weight-logs", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_weight_logs")
        .select("id, value_kg, logged_at")
        .eq("client_id", clientId)
        .order("logged_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WeightLog[];
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["client-attachments", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_attachments")
        .select("id, file_name, storage_path, mime_type, file_size, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const chartData = [...weightLogs]
    .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
    .map((w) => ({
      date: w.logged_at.slice(0, 10),
      kg: w.value_kg,
    }));

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      return toast.error("Use a JPEG, PNG, or WebP image");
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      return toast.error(`Image must be under ${MAX_AVATAR_MB}MB`);
    }
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${clientId}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("client-avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploadingAvatar(false);
      return toast.error(`Upload failed: ${upErr.message}`);
    }
    const { error: dbErr } = await supabase
      .from("clients")
      .update({ avatar_path: path })
      .eq("id", clientId);
    setUploadingAvatar(false);
    if (dbErr) return toast.error(dbErr.message);
    toast.success("Photo updated");
    qc.invalidateQueries({ queryKey: ["client-profile", clientId] });
    qc.invalidateQueries({ queryKey: ["client-avatar-url"] });
  }

  async function saveHeight(value: string) {
    const n = value.trim() === "" ? null : Number(value);
    if (value.trim() !== "" && (Number.isNaN(n) || (n as number) <= 0)) {
      return toast.error("Enter a valid height in cm");
    }
    const { error } = await supabase
      .from("clients")
      .update({ height_cm: n })
      .eq("id", clientId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["client-profile", clientId] });
  }

  async function addWeight() {
    const n = Number(weightValue);
    if (!weightValue || Number.isNaN(n) || n <= 0) {
      return toast.error("Enter a valid weight in kg");
    }
    const { error } = await supabase.from("client_weight_logs").insert({
      coach_id: coachId,
      client_id: clientId,
      value_kg: n,
      logged_at: new Date(weightDate).toISOString(),
    });
    if (error) return toast.error(error.message);
    toast.success("Weight logged");
    setWeightValue("");
    qc.invalidateQueries({ queryKey: ["client-weight-logs", clientId] });
  }

  async function deleteWeight(id: string) {
    const { error } = await supabase
      .from("client_weight_logs")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["client-weight-logs", clientId] });
  }

  async function handleAttachmentChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ATTACHMENT_TYPES.includes(file.type)) {
      return toast.error("Use a JPEG, PNG, or PDF file");
    }
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      return toast.error(`File must be under ${MAX_ATTACHMENT_MB}MB`);
    }
    setUploadingAttachment(true);
    const { data: u } = await supabase.auth.getUser();
    const path = `${clientId}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("client-attachments")
      .upload(path, file, { contentType: file.type });
    if (upErr) {
      setUploadingAttachment(false);
      return toast.error(`Upload failed: ${upErr.message}`);
    }
    const { error: dbErr } = await supabase.from("client_attachments").insert({
      coach_id: coachId,
      client_id: clientId,
      uploaded_by: u.user!.id,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type,
      file_size: file.size,
    });
    setUploadingAttachment(false);
    if (dbErr) return toast.error(dbErr.message);
    toast.success("File uploaded");
    qc.invalidateQueries({ queryKey: ["client-attachments", clientId] });
  }

  async function downloadAttachment(a: Attachment) {
    const { data, error } = await supabase.storage
      .from("client-attachments")
      .createSignedUrl(a.storage_path, 60);
    if (error || !data) return toast.error("Couldn't open file");
    window.open(data.signedUrl, "_blank");
  }

  async function deleteAttachment(a: Attachment) {
    if (!confirm(`Delete "${a.file_name}"?`)) return;
    const { error: storageErr } = await supabase.storage
      .from("client-attachments")
      .remove([a.storage_path]);
    if (storageErr) return toast.error(storageErr.message);
    const { error } = await supabase
      .from("client_attachments")
      .delete()
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["client-attachments", clientId] });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{clientName} — Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border bg-muted"
              title="Change photo"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={clientName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-full w-full p-4 text-muted-foreground" />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                <Upload className="h-5 w-5 text-white" />
              </div>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept={AVATAR_TYPES.join(",")}
              className="hidden"
              onChange={handleAvatarChange}
            />
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={uploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
              >
                {uploadingAvatar ? "Uploading…" : "Change photo"}
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">
                JPEG, PNG, or WebP — up to {MAX_AVATAR_MB}MB
              </p>
            </div>
          </div>

          <div className="rounded border bg-muted/40 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Stats
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Height (cm)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  defaultValue={client?.height_cm ?? ""}
                  placeholder="e.g. 178"
                  onBlur={(e) => saveHeight(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Current weight (kg)</Label>
                <div className="text-sm font-semibold pt-2">
                  {weightLogs[0]
                    ? `${weightLogs[0].value_kg} kg`
                    : "No entries yet"}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Log weight (kg)</Label>
                <Input
                  inputMode="decimal"
                  value={weightValue}
                  onChange={(e) => setWeightValue(e.target.value)}
                  placeholder="72.5"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                />
              </div>
              <Button size="sm" onClick={addWeight}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>

            {chartData.length >= 2 && (
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 10 }}
                      width={35}
                    />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="kg"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {weightLogs.length > 0 && (
              <div className="mt-3 max-h-40 space-y-1 overflow-auto">
                {weightLogs.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between rounded bg-background px-2 py-1 text-xs"
                  >
                    <span>{w.logged_at.slice(0, 10)}</span>
                    <span className="font-medium">{w.value_kg} kg</span>
                    <button onClick={() => deleteWeight(w.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded border bg-muted/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Attachments
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={uploadingAttachment}
                onClick={() => attachmentInputRef.current?.click()}
              >
                <Upload className="mr-1 h-3.5 w-3.5" />
                {uploadingAttachment ? "Uploading…" : "Upload"}
              </Button>
              <input
                ref={attachmentInputRef}
                type="file"
                accept={ATTACHMENT_TYPES.join(",")}
                className="hidden"
                onChange={handleAttachmentChange}
              />
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              JPEG/PNG check-in photos or PDF scans — up to {MAX_ATTACHMENT_MB}
              MB
            </p>
            {attachments.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No attachments yet
              </p>
            ) : (
              <div className="space-y-1">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded bg-background px-2 py-1.5 text-xs"
                  >
                    {a.mime_type === "application/pdf" ? (
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">{a.file_name}</span>
                    <span className="text-muted-foreground">
                      {a.created_at.slice(0, 10)}
                    </span>
                    <button onClick={() => downloadAttachment(a)}>
                      <Download className="h-3.5 w-3.5 text-primary" />
                    </button>
                    <button onClick={() => deleteAttachment(a)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

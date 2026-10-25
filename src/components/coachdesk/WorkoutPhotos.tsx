import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type Photo = {
  id: string;
  file_name: string;
  storage_path: string;
  created_at: string;
};

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_PHOTO_MB = 15;

function photosQueryKey(workoutLogId: string) {
  return ["workout-photos", workoutLogId] as const;
}

// A post-workout photo (e.g. a Strava/Garmin summary screenshot) the
// athlete attaches to a logged session, visible to their coach. Reuses the
// client_attachments table/bucket — see the migration adding
// workout_log_id for why that's safe (RLS already scopes it per client).
export function WorkoutPhotos({
  workoutLogId,
  clientId,
  coachId,
  editable,
  ensureLogId,
}: {
  workoutLogId: string | null;
  clientId: string;
  coachId: string;
  editable: boolean;
  // Called when the athlete picks a photo before a draft log exists yet
  // (e.g. before the first autosave) — should create/return the log id.
  ensureLogId?: () => Promise<string | null>;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: photos = [] } = useQuery({
    queryKey: photosQueryKey(workoutLogId ?? "none"),
    enabled: !!workoutLogId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_attachments")
        .select("id, file_name, storage_path, created_at")
        .eq("workout_log_id", workoutLogId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Photo[];
    },
  });

  const { data: urls = {} } = useQuery({
    queryKey: ["workout-photo-urls", photos.map((p) => p.id).join(",")],
    enabled: photos.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        photos.map(async (p) => {
          const { data } = await supabase.storage
            .from("client-attachments")
            .createSignedUrl(p.storage_path, 3600);
          return [p.id, data?.signedUrl ?? null] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      return toast.error("Use a JPEG, PNG, WebP, or HEIC image");
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      return toast.error(`Image must be under ${MAX_PHOTO_MB}MB`);
    }
    setUploading(true);
    try {
      let logId = workoutLogId;
      if (!logId) {
        logId = (await ensureLogId?.()) ?? null;
        if (!logId) {
          toast.error("Couldn't save the workout yet — try again");
          return;
        }
      }
      const { data: u } = await supabase.auth.getUser();
      const path = `${clientId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("client-attachments")
        .upload(path, file, { contentType: file.type });
      if (upErr) return toast.error(`Upload failed: ${upErr.message}`);
      const { error: dbErr } = await supabase
        .from("client_attachments")
        .insert({
          coach_id: coachId,
          client_id: clientId,
          uploaded_by: u.user!.id,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type,
          file_size: file.size,
          workout_log_id: logId,
        });
      if (dbErr) return toast.error(dbErr.message);
      qc.invalidateQueries({ queryKey: photosQueryKey(logId) });
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(p: Photo) {
    if (!confirm("Remove this photo?")) return;
    await supabase.storage.from("client-attachments").remove([p.storage_path]);
    const { error } = await supabase
      .from("client_attachments")
      .delete()
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: photosQueryKey(workoutLogId ?? "none") });
  }

  if (!editable && photos.length === 0) return null;

  const grid = (
    <div className="space-y-2">
      {(photos.length > 0 || editable) && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="group relative h-20 w-20 shrink-0">
              {urls[p.id] ? (
                <a href={urls[p.id]!} target="_blank" rel="noreferrer">
                  <img
                    src={urls[p.id]!}
                    alt={p.file_name}
                    className="h-20 w-20 rounded-md border border-border object-cover"
                  />
                </a>
              ) : (
                <div className="h-20 w-20 animate-pulse rounded-md border border-border bg-muted" />
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => removePhoto(p)}
                  className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground"
            >
              <Camera className="h-4 w-4" />
              <span className="text-[10px]">
                {uploading ? "Uploading…" : "Add photo"}
              </span>
            </button>
          )}
        </div>
      )}
      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept={PHOTO_TYPES.join(",")}
          className="hidden"
          onChange={handleFile}
        />
      )}
    </div>
  );

  if (editable) return grid;
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold">Photos</div>
      <div className="mt-2">{grid}</div>
    </Card>
  );
}

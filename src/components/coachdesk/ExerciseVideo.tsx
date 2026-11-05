import { useState } from "react";
import { PlayCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getEmbedUrl } from "@/lib/coachdesk/video";

/**
 * The one way an exercise demo is opened anywhere in the app, so a coach
 * picking an exercise and an athlete doing it see the same clip through the
 * same player. YouTube and Vimeo links play inline; anything else opens in a
 * new tab rather than failing silently in an iframe.
 *
 * Renders nothing when there is no video, so callers can drop it in
 * unconditionally instead of repeating the null check.
 */
export function ExerciseVideoButton({
  url,
  name,
  source,
  className,
  size = "icon",
}: {
  url: string | null | undefined;
  /** Shown as the dialog title so it is obvious which exercise is playing. */
  name?: string | null;
  /** Channel or author, credited under the player. */
  source?: string | null;
  className?: string;
  /** "icon" for dense rows, "label" where there is room for a word. */
  size?: "icon" | "label";
}) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  const embed = getEmbedUrl(url);

  function activate(e: React.MouseEvent) {
    // Rows and cards are often clickable themselves.
    e.preventDefault();
    e.stopPropagation();
    if (embed) setOpen(true);
    else window.open(url!, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <button
        type="button"
        onClick={activate}
        title={`Watch demo${name ? `: ${name}` : ""}`}
        aria-label={`Watch demo${name ? `: ${name}` : ""}`}
        className={
          className ??
          (size === "label"
            ? "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-muted"
            : "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-primary hover:bg-muted")
        }
      >
        <PlayCircle className="h-4 w-4" />
        {size === "label" && <span>Demo</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-2">
          <DialogHeader className="px-2 pt-1">
            <DialogTitle>
              {name ? `${name} — demo` : "Exercise demo"}
            </DialogTitle>
          </DialogHeader>
          {embed && (
            <div className="aspect-video w-full overflow-hidden rounded-md">
              <iframe
                src={embed}
                title={
                  name ? `${name} demonstration` : "Exercise demonstration"
                }
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground">
            <span className="truncate">
              {source ? `Source: ${source}` : ""}
            </span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 underline underline-offset-2"
            >
              Open original
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

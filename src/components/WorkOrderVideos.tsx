import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { customerVideoLink } from "@/lib/video-link";
import { deleteCustomerVideo, listWorkOrderVideos, mailCustomerVideo, registerCustomerVideo, type CustomerVideo } from "@/lib/videos.functions";

const BUCKET = "klant-filmpjes";

/** Admin: upload videos for a work order and share them with the customer via a view-only link. */
export function WorkOrderVideos({ workOrderId, customerId, hasEmail }: { workOrderId: string; customerId: string | null; hasEmail: boolean }) {
  const [videos, setVideos] = useState<CustomerVideo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const list = useServerFn(listWorkOrderVideos);
  const register = useServerFn(registerCustomerVideo);
  const remove = useServerFn(deleteCustomerVideo);
  const mail = useServerFn(mailCustomerVideo);

  const refresh = useCallback(() => {
    list({ data: { workOrderId } }).then(setVideos).catch(() => {});
  }, [list, workOrderId]);
  useEffect(refresh, [refresh]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("video/")) { toast.error(`${f.name}: kies een videobestand`); continue; }
      const ext = (f.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      const path = `${workOrderId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type });
      if (error) { toast.error(`${f.name} uploaden mislukt`); continue; }
      try {
        await register({ data: { workOrderId, customerId, path, title: f.name.replace(/\.[^.]+$/, "") } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Filmpje registreren mislukt");
      }
    }
    setUploading(false);
    refresh();
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(customerVideoLink(token));
      toast.success("Link gekopieerd");
    } catch {
      toast.error(customerVideoLink(token));
    }
  }

  async function sendMail(v: CustomerVideo) {
    setBusyId(v.id);
    try {
      const r = await mail({ data: { videoId: v.id } });
      if (r.sent) toast.success("Mail met link verstuurd");
      else if (r.reason === "no_email") toast.error("De klant heeft geen e-mailadres");
      else if (r.reason === "mailbox_not_connected") toast.error("De mailbox info@riory.be is niet gekoppeld");
      else toast.error("Mail versturen mislukt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mail versturen mislukt");
    }
    setBusyId(null);
  }

  async function verwijder(v: CustomerVideo) {
    if (!window.confirm(`Filmpje "${v.title}" definitief verwijderen? De link stopt meteen met werken.`)) return;
    setBusyId(v.id);
    try {
      await remove({ data: { videoId: v.id } });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
    setBusyId(null);
  }

  return (
    <div className="space-y-2 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold">Filmpjes voor de klant</h2>
        <Button asChild type="button" size="sm" variant="outline" className="ml-auto">
          <label className="cursor-pointer">
            {uploading ? "Uploaden…" : "+ Filmpje uploaden"}
            <input type="file" accept="video/*" multiple className="hidden" disabled={uploading} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          </label>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">De klant krijgt een link om het filmpje te bekijken. Downloaden kan niet.</p>
      {videos.length === 0 && <p className="text-xs text-muted-foreground">Nog geen filmpjes bij deze werkbon.</p>}
      <ul className="space-y-1">
        {videos.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{v.title || "Filmpje"}</span>
            <span className="text-xs text-muted-foreground">{v.created_at.slice(0, 10)}</span>
            <Button type="button" size="sm" variant="outline" disabled={busyId === v.id} onClick={() => void copyLink(v.token)}>Link kopiëren</Button>
            {hasEmail && <Button type="button" size="sm" variant="outline" disabled={busyId === v.id} onClick={() => void sendMail(v)}>Mail link</Button>}
            <Button type="button" size="sm" variant="destructive" disabled={busyId === v.id} onClick={() => void verwijder(v)}>Verwijderen</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

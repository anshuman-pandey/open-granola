import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { getBackend } from "../lib/backend";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export function CaptureSourceDialog({ onStart, onClose }: {
  onStart: (systemAudio: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [systemAudio, setSystemAudio] = useState(false);
  useEffect(() => {
    let disposed = false;
    getBackend().modelStatus().then((status) => {
      const capabilities = status.capabilities as Record<string, unknown> | undefined;
      if (!disposed) setAvailable(capabilities?.system_audio === true);
    }).catch(() => {});
    return () => { disposed = true; };
  }, []);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("Choose audio sources")}</DialogTitle>
        <DialogDescription>{t("System audio includes other apps, call participants and notifications. Use headphones and get participants' consent. Audio stays in memory; your summary provider settings still apply.")}</DialogDescription>
      </DialogHeader>
      <label className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
        <input type="checkbox" checked={systemAudio} disabled={!available}
          onChange={(event) => setSystemAudio(event.target.checked)} />
        {t("Microphone + system audio")}
      </label>
      <p className="text-xs text-muted-foreground">{available ? t("Unchecked: microphone only. System audio is experimental on macOS 14.4 or later.") : t("System audio capture is not available in this build.")}</p>
      <button className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={() => onStart(available && systemAudio)}>{t("Start capture")}</button>
    </DialogContent>
  </Dialog>;
}

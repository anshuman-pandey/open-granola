import { Briefcase, Layers, Mic, Plus, Target, Users, Zap } from "lucide-react";
import { TEMPLATES } from "../lib/data";

const ICONS: Record<string, React.ReactNode> = {
  Layers: <Layers size={17} />,
  Users: <Users size={17} />,
  Target: <Target size={17} />,
  Zap: <Zap size={17} />,
  Mic: <Mic size={17} />,
  Briefcase: <Briefcase size={17} />,
};

export function TemplatesView() {
  return (
    <div className="scrollbar-thin paper-texture flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 pb-16 pt-10">
        <h1 className="font-display text-[32px]">Note templates</h1>
        <p className="mt-1 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">
          Sotto matches the right template to each meeting automatically — or pin one before you hit record. Write your
          own in plain Markdown; the local model fills the structure from the transcript.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {TEMPLATES.map((t, i) => (
            <div
              key={t.id}
              className="animate-rise group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-2.5">
                <span className="ember-gradient flex h-8 w-8 items-center justify-center rounded-xl text-white">
                  {ICONS[t.icon]}
                </span>
                <span className="text-[15px] font-semibold">{t.name}</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {t.structure.map((s) => (
                  <li key={s} className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <span className="h-1 w-1 rounded-full bg-primary/60" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button className="animate-rise flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary" style={{ animationDelay: "300ms" }}>
            <Plus size={20} />
            <span className="text-[13px] font-medium">New template from Markdown</span>
          </button>
        </div>
      </div>
    </div>
  );
}

import { BookOpen, Briefcase, Copy, Download, Layers, Mic, Plus, Target, Users, Zap } from "lucide-react";
import { useState } from "react";
import { RECIPES, TEMPLATES } from "../lib/data";

const ICONS: Record<string, React.ReactNode> = {
  Layers: <Layers size={17} />,
  Users: <Users size={17} />,
  Target: <Target size={17} />,
  Zap: <Zap size={17} />,
  Mic: <Mic size={17} />,
  Briefcase: <Briefcase size={17} />,
};

export function TemplatesView() {
  const [copied, setCopied] = useState<string | null>(null);
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

        {/* recipes */}
        <div className="mt-10">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-[26px]">Recipes</h2>
              <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
                Shareable prompt packs that run on your local model over any meeting — or across your whole
                library. Plain Markdown, so they sync through git, gist, or carrier pigeon.
              </p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold text-secondary-foreground">
              {RECIPES.length} installed
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {RECIPES.map((r, i) => (
              <div
                key={r.id}
                className="animate-rise rounded-2xl border border-border bg-card p-4 shadow-sm"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="ember-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white">
                    <BookOpen size={15} />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold">{r.name}</span>
                      <span className="text-[11px] text-muted-foreground">{r.author}</span>
                    </div>
                    <div className="text-[12px] text-muted-foreground">{r.description}</div>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Download size={11} /> {r.downloads.toLocaleString()}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(r.prompt);
                      setCopied(r.id);
                      setTimeout(() => setCopied(null), 1200);
                    }}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      copied === r.id
                        ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    <Copy size={12} /> {copied === r.id ? "Copied" : "Copy prompt"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-muted-foreground">
            Publish your own: add a <span className="font-mono2">*.recipe.md</span> file to the community repo —
            recipes are sandboxed prompts, never code, so they're safe to share.
          </p>
        </div>
      </div>
    </div>
  );
}

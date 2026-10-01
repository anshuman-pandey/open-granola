import {
  BookOpen,
  Briefcase,
  Copy,
  Download,
  Layers,
  Mic,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { RECIPES, TEMPLATES } from "../lib/data";
import { downloadMarkdown } from "./meeting-export";

const ICONS: Record<string, ReactNode> = {
  Layers: <Layers size={17} />,
  Users: <Users size={17} />,
  Target: <Target size={17} />,
  Zap: <Zap size={17} />,
  Mic: <Mic size={17} />,
  Briefcase: <Briefcase size={17} />,
};

export function TemplatesView() {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const copy = async (text: string, name: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${name} copied.`);
      setError("");
    } catch {
      setError(
        "Clipboard access was unavailable. Use Download to save the Markdown instead.",
      );
    }
  };
  return (
    <div className="scrollbar-thin paper-texture min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-5 pb-24 pt-10 sm:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
          A place to start
        </p>
        <h1 className="font-display mt-2 text-[36px]">Note templates</h1>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
          Useful outlines for different conversations. Copy or download a
          template to adapt in your own notes.
        </p>
        {notice && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-border bg-secondary p-3 text-xs"
          >
            {notice}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"
          >
            {error}
          </p>
        )}
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {TEMPLATES.map((template) => {
            const markdown = `# ${template.name}\n\n${template.structure.map((section) => `## ${section}\n\n`).join("")}`;
            return (
              <section
                key={template.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {ICONS[template.icon] ?? <BookOpen size={17} />}
                  </span>
                  <h2 className="text-sm font-semibold">{template.name}</h2>
                </div>
                <ul className="mb-5 mt-4 space-y-2">
                  {template.structure.map((section) => (
                    <li
                      key={section}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span className="h-1 w-1 rounded-full bg-primary/60" />
                      {section}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex items-center gap-2 border-t border-border pt-4">
                  <button
                    onClick={() => void copy(markdown, template.name)}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold"
                  >
                    <Copy size={12} />
                    Copy outline
                  </button>
                  <button
                    onClick={() => downloadMarkdown(template.name, markdown)}
                    className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-secondary"
                    aria-label={`Download ${template.name} template`}
                    title="Download Markdown"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </section>
            );
          })}
        </div>
        <section className="mt-10">
          <h2 className="font-display text-[28px]">Prompts to try</h2>
          <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
            Starting points for turning meeting notes into useful follow-ups.
            Review each prompt before using it with your chosen assistant.
          </p>
          <div className="mt-5 space-y-3">
            {RECIPES.map((recipe) => (
              <details
                key={recipe.id}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <summary className="cursor-pointer text-sm font-semibold">
                  {recipe.name}
                  <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
                    {recipe.description}
                  </span>
                </summary>
                <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-secondary p-4 font-sans text-xs leading-relaxed">
                  {recipe.prompt}
                </pre>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => void copy(recipe.prompt, recipe.name)}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold"
                  >
                    <Copy size={12} />
                    Copy prompt
                  </button>
                  <button
                    onClick={() => downloadMarkdown(recipe.name, recipe.prompt)}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold"
                  >
                    <Download size={12} />
                    Download
                  </button>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

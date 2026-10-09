import { useI18n } from "../i18n";
import {
  BookOpen,
  Briefcase,
  Check,
  ChevronDown,
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
  const { t, plural } = useI18n();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const copy = async (text: string, name: string) => {
    setNotice("");
    setError("");
    setCopied("");
    try {
      await navigator.clipboard.writeText(text);
      setNotice(name);
      setCopied(name);
    } catch {
      setError(
        "Clipboard access was unavailable. Use Download to save the Markdown instead.",
      );
    }
  };
  return (
    <div className="scrollbar-thin paper-texture min-h-0 flex-1 overflow-y-auto">
      <div className="workspace-page mx-auto max-w-4xl px-5 pb-24 pt-10 sm:px-8">
        <p className="section-eyebrow">{t("A place to start")}</p>
        <h1 className="font-display mt-3 text-[40px] leading-tight tracking-tight sm:text-[48px]">
          {t("Note templates")}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {t(
            "Useful outlines for different conversations. Copy or download a template to adapt in your own notes.",
          )}
        </p>
        {notice && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-border bg-secondary p-3 text-xs"
          >
            {t("{name} copied.", { name: notice })}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive dark:text-red-400"
          >
            {t(error)}
          </p>
        )}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {TEMPLATES.map((template) => {
            const markdown = `# ${template.name}\n\n${template.structure.map((section) => `## ${section}\n\n`).join("")}`;
            return (
              <section
                key={template.id}
                className="surface-card group flex min-w-0 flex-col p-5 transition-colors hover:border-primary/25 sm:p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5 text-primary">
                    {ICONS[template.icon] ?? <BookOpen size={17} />}
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">{template.name}</h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {plural(
                        "{count} section · Markdown",
                        "{count} sections · Markdown",
                        template.structure.length,
                      )}
                    </p>
                  </div>
                </div>
                <ul className="mb-5 mt-6 space-y-3 border-l border-border pl-4">
                  {template.structure.map((section) => (
                    <li
                      key={section}
                      className="flex items-center gap-2 text-xs leading-relaxed text-muted-foreground"
                    >
                      {section}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex items-center gap-2 border-t border-border pt-4">
                  <button
                    onClick={() => void copy(markdown, template.name)}
                    aria-label={t("Copy {name} outline", {
                      name: template.name,
                    })}
                    className="button-secondary gap-2"
                  >
                    {copied === template.name ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copied === template.name ? t("Copied") : t("Copy outline")}
                  </button>
                  <button
                    onClick={() => downloadMarkdown(template.name, markdown)}
                    className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label={t("Download {name} template", {
                      name: template.name,
                    })}
                    title={t("Download Markdown")}
                  >
                    <Download size={16} />
                  </button>
                </div>
              </section>
            );
          })}
        </div>
        <section className="mt-12 border-t border-border pt-8">
          <p className="section-eyebrow">{t("After the conversation")}</p>
          <h2 className="font-display mt-2 text-[32px] tracking-tight">
            {t("Prompts to try")}
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {t(
              "Starting points for turning meeting notes into useful follow-ups. Review each prompt before using it with your chosen assistant.",
            )}
          </p>
          <div className="mt-5 space-y-3">
            {RECIPES.map((recipe) => (
              <details
                key={recipe.id}
                className="surface-card group min-w-0 px-5 open:border-primary/25"
              >
                <summary className="flex list-none items-center justify-between gap-4 rounded-lg py-5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span>
                    {recipe.name}
                    <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
                      {recipe.description}
                    </span>
                  </span>
                  <ChevronDown
                    size={16}
                    className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  />
                </summary>
                <pre className="whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-secondary/50 p-4 font-sans text-xs leading-relaxed">
                  {recipe.prompt}
                </pre>
                <div className="flex flex-wrap gap-2 py-4">
                  <button
                    onClick={() => void copy(recipe.prompt, recipe.name)}
                    aria-label={t("Copy {name} prompt", { name: recipe.name })}
                    className="button-secondary gap-2"
                  >
                    {copied === recipe.name ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copied === recipe.name ? t("Copied") : t("Copy prompt")}
                  </button>
                  <button
                    onClick={() => downloadMarkdown(recipe.name, recipe.prompt)}
                    aria-label={t("Download {name} prompt", {
                      name: recipe.name,
                    })}
                    className="button-secondary gap-2"
                  >
                    <Download size={14} />
                    {t("Download")}
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

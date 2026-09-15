import { useEffect, useRef, useState } from "react";
import { Pencil, Check, X } from "lucide-react";

/** Título editável no lugar (só admin vê o lápis). */
export function InlineTitle({
  value,
  canEdit,
  onSave,
  placeholder = "Título",
  className = "",
}: {
  value: string;
  canEdit: boolean;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (canEdit && editing) {
    return (
      <span className="inline-flex w-full items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onSave(draft.trim() || value); setEditing(false); }
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          className={`w-full rounded-lg border border-primary/40 bg-surface px-2 py-1 outline-none focus:border-primary ${className}`}
        />
        <button onClick={() => { onSave(draft.trim() || value); setEditing(false); }} className="shrink-0 rounded-md gradient-gold p-1.5 text-primary-foreground" title="Salvar">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={() => { setDraft(value); setEditing(false); }} className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground" title="Cancelar">
          <X className="h-4 w-4" />
        </button>
      </span>
    );
  }

  return (
    <span className={`group/inline inline-flex items-center gap-2 ${className}`}>
      {value}
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 text-muted-foreground/50 transition hover:text-primary"
          title="Editar"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
    </span>
  );
}

/** Texto/descrição editável no lugar (só admin vê o lápis). */
export function InlineText({
  value,
  canEdit,
  onSave,
  placeholder = "Escreva aqui…",
  className = "",
}: {
  value: string;
  canEdit: boolean;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(value), [value]);

  if (canEdit && editing) {
    return (
      <div className="max-w-2xl">
        <textarea
          ref={ref}
          autoFocus
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="w-full resize-none rounded-xl border border-primary/40 bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => { onSave(draft.trim()); setEditing(false); }} className="inline-flex items-center gap-1.5 rounded-lg gradient-gold px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            <Check className="h-3.5 w-3.5" /> Salvar
          </button>
          <button onClick={() => { setDraft(value); setEditing(false); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group/inline relative ${className}`}>
      <p className="max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
        {value || (canEdit ? placeholder : "")}
      </p>
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60 transition hover:text-primary"
          title="Editar descrição"
        >
          <Pencil className="h-3 w-3" /> editar descrição
        </button>
      )}
    </div>
  );
}

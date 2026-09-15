import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft, Loader2, Pencil, Check, X, Plus, Trash2, Play, Youtube,
  ImagePlus, GripVertical, Settings2, ArrowLeft,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { LurePlayer } from "@/components/lure-player";
import { Comments } from "@/components/comments";
import { sectionTitle, uploadCover, validateImageFile, type ModuleRow } from "@/lib/sections";
import { parseYouTubeId } from "@/lib/youtube";
import lureLogo from "@/assets/lure-logo-large.png.asset.json";

export const Route = createFileRoute("/modulo/$id")({
  head: () => ({ meta: [{ title: "Módulo — LURE Growth" }] }),
  component: ModulePage,
});

type Lesson = {
  id: string;
  module_id: string;
  position: number;
  title: string;
  youtube_url: string | null;
};

function ModulePage() {
  const { id } = Route.useParams();
  const { isAdmin } = useAuth();

  const [mod, setMod] = useState<ModuleRow | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const loadAll = useCallback(async () => {
    const [{ data: m }, { data: ls }] = await Promise.all([
      supabase
        .from("modules")
        .select("id, section_id, title, description, author, youtube_url, cover_url, sort_order, created_at")
        .eq("id", id)
        .single(),
      supabase
        .from("module_lessons")
        .select("id, module_id, position, title, youtube_url")
        .eq("module_id", id)
        .order("position", { ascending: true }),
    ]);
    setMod((m as ModuleRow) ?? null);
    const list = (ls as Lesson[]) ?? [];
    setLessons(list);
    setActiveId((cur) => cur ?? list[0]?.id ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const active = lessons.find((l) => l.id === activeId) ?? null;

  /* ---- ações de admin ---- */
  const saveModule = async (patch: Partial<ModuleRow>) => {
    if (!mod) return;
    setMod({ ...mod, ...patch });
    await supabase.from("modules").update(patch).eq("id", mod.id);
  };

  const addLesson = async () => {
    if (!mod) return;
    const position = (lessons[lessons.length - 1]?.position ?? 0) + 1;
    const { data } = await supabase
      .from("module_lessons")
      .insert({ module_id: mod.id, position, title: `Aula ${lessons.length + 1}` })
      .select("id, module_id, position, title, youtube_url")
      .single();
    if (data) {
      setLessons((prev) => [...prev, data as Lesson]);
      setActiveId((data as Lesson).id);
    }
  };

  const updateLesson = async (lessonId: string, patch: Partial<Lesson>) => {
    setLessons((prev) => prev.map((l) => (l.id === lessonId ? { ...l, ...patch } : l)));
    await supabase.from("module_lessons").update(patch).eq("id", lessonId);
  };

  const deleteLesson = async (lessonId: string) => {
    setLessons((prev) => prev.filter((l) => l.id !== lessonId));
    if (activeId === lessonId) setActiveId(lessons.find((l) => l.id !== lessonId)?.id ?? null);
    await supabase.from("module_lessons").delete().eq("id", lessonId);
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!mod) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-center">
        <div>
          <p className="font-display text-xl font-bold">Módulo não encontrado</p>
          <Link to="/" className="mt-5 inline-flex rounded-xl gradient-gold px-4 py-2 text-sm font-semibold text-primary-foreground">
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header
        className="dark-scope sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/85 px-4 pb-3 backdrop-blur-xl md:px-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="flex items-center gap-2">
          <img src={lureLogo.url} alt="Lure" className="h-6 w-6 object-contain" />
          <span className="text-sm font-semibold tracking-[0.14em]">LURE Growth</span>
        </div>
        {isAdmin ? (
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              editMode
                ? "border-primary bg-primary text-primary-foreground"
                : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {editMode ? "Concluir edição" : "Editar módulo"}
          </button>
        ) : (
          <span className="w-16" />
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px]">
        {/* ---------- Coluna principal ---------- */}
        <main className="min-w-0">
          {/* Player */}
          <div className="relative aspect-video w-full bg-black">
            {active?.youtube_url ? (
              <LurePlayer key={active.id} videoUrl={active.youtube_url} className="absolute inset-0 h-full w-full" />
            ) : (
              <EmptyPlayer
                editMode={editMode}
                hasLessons={lessons.length > 0}
                onSaveLink={active ? (url) => updateLesson(active.id, { youtube_url: url }) : undefined}
              />
            )}
          </div>

          {/* Info do módulo */}
          <div className="border-b border-border px-6 py-8 md:px-10">
            <div className="lure-rise text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              {sectionTitle(mod.section_id)}
            </div>

            <EditableTitle
              value={mod.title}
              editMode={editMode}
              onSave={(title) => saveModule({ title })}
            />

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <EditableAuthor value={mod.author} editMode={editMode} onSave={(author) => saveModule({ author })} />
              <span className="inline-flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5" /> {lessons.length} {lessons.length === 1 ? "aula" : "aulas"}
              </span>
              {editMode && <CoverButton mod={mod} onSaved={(url) => saveModule({ cover_url: url })} />}
            </div>

            {active && (
              <p className="mt-6 max-w-3xl text-lg font-medium">
                <span className="text-muted-foreground">Assistindo agora: </span>
                {active.title}
              </p>
            )}
          </div>

          {/* Comentários */}
          <Comments slug={`mod-${mod.id}`} />
        </main>

        {/* ---------- Aulas ---------- */}
        <aside className="border-l border-border bg-surface/40 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Conteúdo</div>
              <div className="mt-0.5 text-sm font-semibold">
                {lessons.length} {lessons.length === 1 ? "aula" : "aulas"}
              </div>
            </div>
            {editMode && (
              <button
                onClick={addLesson}
                className="inline-flex items-center gap-1.5 rounded-lg gradient-gold px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110"
              >
                <Plus className="h-3.5 w-3.5" /> Aula
              </button>
            )}
          </div>

          {lessons.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {editMode ? "Adicione a primeira aula acima." : "As aulas deste módulo estão sendo preparadas."}
              </p>
            </div>
          ) : (
            <ul className="space-y-1 p-3">
              {lessons.map((l, i) => (
                <LessonRow
                  key={l.id}
                  lesson={l}
                  index={i}
                  active={l.id === activeId}
                  editMode={editMode}
                  onSelect={() => setActiveId(l.id)}
                  onUpdate={(patch) => updateLesson(l.id, patch)}
                  onDelete={() => deleteLesson(l.id)}
                />
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ============================== Player vazio ============================== */

function EmptyPlayer({
  editMode, hasLessons, onSaveLink,
}: {
  editMode: boolean;
  hasLessons: boolean;
  onSaveLink?: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    if (!url.trim() || !parseYouTubeId(url)) {
      setErr("Cole um link válido do YouTube.");
      return;
    }
    onSaveLink?.(url.trim());
    setUrl("");
    setErr(null);
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full border border-white/10 bg-white/5">
        <Youtube className="h-7 w-7 text-white/50" />
      </div>
      {editMode && onSaveLink ? (
        <div className="w-full max-w-md">
          <p className="mb-2 text-sm font-semibold text-white/90">Cole o link do YouTube desta aula</p>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary/60"
            />
            <button onClick={save} className="shrink-0 rounded-lg gradient-gold px-4 py-2 text-sm font-semibold text-primary-foreground">
              Salvar
            </button>
          </div>
          {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
          <p className="mt-2 text-[11px] text-white/40">Dica: suba o vídeo como “Não listado”. No player não aparece marca do YouTube.</p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-white/90">
            {hasLessons ? "Selecione uma aula" : "Vídeo em breve"}
          </p>
          <p className="mt-1 text-xs text-white/45">Novo conteúdo chegando</p>
        </div>
      )}
    </div>
  );
}

/* ============================== Título editável ============================== */

function EditableTitle({ value, editMode, onSave }: { value: string; editMode: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (editMode && editing) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-lg border border-primary/40 bg-surface px-3 py-2 font-display text-2xl font-bold outline-none focus:border-primary md:text-3xl"
        />
        <button onClick={() => { onSave(draft.trim() || value); setEditing(false); }} className="rounded-lg gradient-gold p-2 text-primary-foreground" title="Salvar">
          <Check className="h-5 w-5" />
        </button>
        <button onClick={() => { setDraft(value); setEditing(false); }} className="rounded-lg border border-border p-2 text-muted-foreground" title="Cancelar">
          <X className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <h1 className="lure-rise group mt-2 flex items-start gap-3 font-display text-3xl font-bold leading-tight md:text-4xl" style={{ ["--d" as string]: "60ms" }}>
      {value}
      {editMode && (
        <button
          onClick={() => setEditing(true)}
          className="mt-1.5 shrink-0 text-muted-foreground/60 transition hover:text-primary"
          title="Renomear módulo"
        >
          <Pencil className="h-5 w-5" />
        </button>
      )}
    </h1>
  );
}

function EditableAuthor({ value, editMode, onSave }: { value: string | null; editMode: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

  if (editMode && editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { onSave(draft.trim()); setEditing(false); }}
          placeholder="Autor / mentor"
          className="rounded-md border border-primary/40 bg-surface px-2 py-1 text-sm outline-none"
        />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {value ? `com ${value}` : editMode ? "sem autor" : ""}
      {editMode && (
        <button onClick={() => setEditing(true)} className="text-muted-foreground/60 transition hover:text-primary" title="Editar autor">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

function CoverButton({ mod, onSaved }: { mod: ModuleRow; onSaved: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const pick = async (f: File | null) => {
    if (!f) return;
    const err = validateImageFile(f);
    if (err) return setStatus({ type: "err", text: err });
    setBusy(true);
    setStatus(null);
    try {
      const url = await uploadCover(f, mod.id);
      onSaved(url);
      setStatus({ type: "ok", text: "Foto salva!" });
    } catch (e: unknown) {
      setStatus({ type: "err", text: `Não salvou: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remover a capa deste módulo?")) return;
    setBusy(true);
    setStatus(null);
    try {
      await onSaved(null);
      setStatus({ type: "ok", text: "Capa removida!" });
    } catch (e: unknown) {
      setStatus({ type: "err", text: `Não removeu: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/20"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {busy ? "Salvando…" : mod.cover_url ? "Trocar foto" : "Adicionar foto"}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </button>
      {mod.cover_url && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remover foto
        </button>
      )}
      {status && (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            status.type === "ok" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {status.type === "ok" && <Check className="h-3.5 w-3.5" />}
          {status.text}
        </span>
      )}
    </div>
  );
}

/* ============================== Linha de aula ============================== */

function LessonRow({
  lesson, index, active, editMode, onSelect, onUpdate, onDelete,
}: {
  lesson: Lesson;
  index: number;
  active: boolean;
  editMode: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<Lesson>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [url, setUrl] = useState(lesson.youtube_url ?? "");
  useEffect(() => { setTitle(lesson.title); setUrl(lesson.youtube_url ?? ""); }, [lesson.title, lesson.youtube_url]);

  const hasVideo = !!lesson.youtube_url;
  const urlOk = !url.trim() || !!parseYouTubeId(url);

  if (editMode) {
    return (
      <li className="rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-background text-[11px] font-bold text-muted-foreground">{index + 1}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== lesson.title && onUpdate({ title: title.trim() })}
            placeholder="Título da aula"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary/50"
          />
          <button onClick={onDelete} className="shrink-0 text-muted-foreground transition hover:text-red-400" title="Apagar aula">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 pl-8">
          <Youtube className={`h-4 w-4 shrink-0 ${urlOk ? "text-muted-foreground" : "text-red-400"}`} />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => { if (urlOk && url.trim() !== (lesson.youtube_url ?? "")) onUpdate({ youtube_url: url.trim() || null }); }}
            placeholder="Link do YouTube desta aula"
            className={`min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50 ${urlOk ? "border-border" : "border-red-500/50"}`}
          />
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={onSelect}
        className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
          active ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border hover:bg-background"
        }`}
      >
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${active ? "gradient-gold text-primary-foreground" : "bg-background text-muted-foreground"}`}>
          <Play className="h-4 w-4 fill-current" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-sm font-semibold ${active ? "text-primary" : ""}`}>
            {index + 1}. {lesson.title}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {hasVideo ? "Vídeo disponível" : "Em breve"}
          </div>
        </div>
      </button>
    </li>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft, LayoutGrid, Plus, Loader2, Trash2, Pencil, Youtube,
  ImagePlus, X, CheckCircle2, Video,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  SECTIONS, sectionTitle, uploadCover, validateImageFile, type ModuleRow,
} from "@/lib/sections";
import { parseYouTubeId } from "@/lib/youtube";
import lureLogo from "@/assets/lure-logo-large.png.asset.json";

export const Route = createFileRoute("/admin_/modulos")({
  head: () => ({ meta: [{ title: "Módulos — LURE Growth" }] }),
  component: ModulesAdminPage,
});

function ModulesAdminPage() {
  const { session, isAdmin } = useAuth();
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ModuleRow | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("modules")
      .select("id, section_id, title, description, author, youtube_url, cover_url, sort_order, created_at")
      .order("section_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setModules((data as ModuleRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (m: ModuleRow) => {
    setEditing(m);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const grouped = useMemo(() => {
    return SECTIONS.map((s) => ({
      section: s,
      items: modules.filter((m) => m.section_id === s.id),
    })).filter((g) => g.items.length > 0);
  }, [modules]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 pb-3 backdrop-blur-xl md:px-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <div className="flex items-center gap-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Link>
          <div className="hidden h-6 w-px bg-border md:block" />
          <div className="hidden items-center gap-2 md:flex">
            <img src={lureLogo.url} alt="Lure" className="h-6 w-6 object-contain" />
            <span className="text-sm font-semibold tracking-wider">Módulos</span>
          </div>
        </div>
        <Link to="/admin" className="text-xs font-semibold text-muted-foreground transition hover:text-foreground">
          Gerenciar acessos →
        </Link>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-8 md:px-10 lg:py-12">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Módulos</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Adicione módulos com um link do YouTube. No site, o vídeo toca no player da LURE — sem cara de YouTube.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          <div ref={formRef}>
            <ModuleForm
              key={editing?.id ?? "new"}
              editing={editing}
              userId={session?.user?.id}
              isAdmin={isAdmin}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                load();
              }}
            />
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-surface text-muted-foreground">
                  <LayoutGrid className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold">Seus módulos</h2>
                  <p className="text-xs text-muted-foreground">{modules.length} no total</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : modules.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Video className="mx-auto h-7 w-7 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-semibold">Nenhum módulo ainda</p>
                <p className="mt-1 text-xs text-muted-foreground">Use o formulário ao lado para adicionar o primeiro.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {grouped.map((g) => (
                  <div key={g.section.id} className="px-4 py-4">
                    <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                      {g.section.title}
                    </div>
                    <ul className="space-y-1.5">
                      {g.items.map((m) => (
                        <ModuleRowItem key={m.id} m={m} onEdit={() => startEdit(m)} onChanged={load} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function ModuleRowItem({ m, onEdit, onChanged }: { m: ModuleRow; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  const del = async () => {
    if (!window.confirm(`Apagar o módulo "${m.title}"? Isso não tem desfazer.`)) return;
    setBusy(true);
    await supabase.from("modules").delete().eq("id", m.id);
    setBusy(false);
    onChanged();
  };

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface">
      <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-black">
        {m.cover_url ? (
          <img src={m.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Video className="h-4 w-4 text-white/30" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{m.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {m.youtube_url ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> com vídeo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <Youtube className="h-3 w-3" /> sem vídeo
            </span>
          )}
          {m.author && <span className="truncate">· {m.author}</span>}
        </div>
      </div>
      <button onClick={onEdit} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground" title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={del} disabled={busy} className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50" title="Apagar">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}

function ModuleForm({
  editing, userId, isAdmin, onSaved, onCancel,
}: {
  editing: ModuleRow | null;
  userId?: string;
  isAdmin: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!editing;
  const [sectionId, setSectionId] = useState(editing?.section_id ?? SECTIONS[0].id);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [author, setAuthor] = useState(editing?.author ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(editing?.youtube_url ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(editing?.cover_url ?? null);
  const [removeCover, setRemoveCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (preview && cover) URL.revokeObjectURL(preview);
    },
    [preview, cover],
  );

  const ytOk = !youtubeUrl.trim() || !!parseYouTubeId(youtubeUrl);

  const pickCover = (f: File | null) => {
    if (!f) return;
    const err = validateImageFile(f);
    if (err) {
      setMsg({ type: "err", text: err });
      return;
    }
    if (preview && cover) URL.revokeObjectURL(preview);
    setCover(f);
    setPreview(URL.createObjectURL(f));
    setRemoveCover(false);
    setMsg(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!title.trim()) return setMsg({ type: "err", text: "Dê um título ao módulo." });
    if (youtubeUrl.trim() && !parseYouTubeId(youtubeUrl))
      return setMsg({ type: "err", text: "Link do YouTube inválido." });

    setSaving(true);
    const payload = {
      section_id: sectionId,
      title: title.trim(),
      author: author.trim() || null,
      youtube_url: youtubeUrl.trim() || null,
      description: description.trim() || null,
    };

    let moduleId = editing?.id;
    if (isEdit && moduleId) {
      const { error } = await supabase.from("modules").update(payload).eq("id", moduleId);
      if (error) {
        setSaving(false);
        return setMsg({ type: "err", text: error.message });
      }
    } else {
      const { data, error } = await supabase
        .from("modules")
        .insert({ ...payload, created_by: userId ?? null })
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        return setMsg({ type: "err", text: error?.message ?? "Falha ao criar." });
      }
      moduleId = (data as { id: string }).id;
    }

    // Envia a capa (se escolhida) e salva a URL.
    if (cover && moduleId) {
      try {
        const url = await uploadCover(cover, moduleId);
        const { error: coverErr } = await supabase
          .from("modules")
          .update({ cover_url: url })
          .eq("id", moduleId);
        if (coverErr) throw coverErr;
      } catch (err: unknown) {
        setSaving(false);
        const detail = err instanceof Error ? err.message : String(err);
        setMsg({
          type: "err",
          text: !isAdmin
            ? "A capa não subiu: só administradores podem enviar imagens. Entre com uma conta admin."
            : `A capa não subiu: ${detail}`,
        });
        // Não chama onSaved() para o admin poder tentar de novo sem perder o formulário.
        return;
      }
    } else if (removeCover && moduleId) {
      // Remover a capa: limpa a URL no banco (a imagem antiga fica no storage, mas o módulo passa a não ter capa).
      const { error: rmErr } = await supabase
        .from("modules")
        .update({ cover_url: null })
        .eq("id", moduleId);
      if (rmErr) {
        setSaving(false);
        return setMsg({ type: "err", text: `Não removeu a capa: ${rmErr.message}` });
      }
    }

    setSaving(false);
    onSaved();
  };

  return (
    <form
      onSubmit={submit}
      className="h-fit overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary/10 to-card px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-gold text-primary-foreground">
            {isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4.5 w-4.5" />}
          </div>
          <h2 className="font-display text-lg font-bold">{isEdit ? "Editar módulo" : "Novo módulo"}</h2>
        </div>
        {isEdit && (
          <button type="button" onClick={onCancel} className="text-muted-foreground transition hover:text-foreground" title="Cancelar edição">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-4 p-5">
        {/* Capa */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">Capa (opcional)</label>
          {!isAdmin && (
            <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">
              Você não está logado como administrador — o envio de imagens ficará bloqueado pelo servidor.
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-black">
              {preview ? (
                <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-white/30">
                  <Video className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
              >
                <ImagePlus className="h-3.5 w-3.5" /> Escolher imagem
              </button>
              {preview && (
                <button
                  type="button"
                  onClick={() => {
                    if (preview && cover) URL.revokeObjectURL(preview);
                    setCover(null);
                    setPreview(null);
                    // Se o módulo já tinha capa salva, marca para apagar no banco ao salvar.
                    if (isEdit && editing?.cover_url) setRemoveCover(true);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="text-left text-[11px] text-muted-foreground transition hover:text-red-400"
                >
                  remover
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickCover(e.target.files?.[0] ?? null)}
            />
          </div>
          {cover && (
            <p className="mt-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] font-medium text-primary">
              Imagem escolhida. Clique em <b>“{isEdit ? "Salvar alterações" : "Adicionar módulo"}”</b> abaixo para gravar.
            </p>
          )}
          {removeCover && !cover && (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-400">
              Capa marcada para remoção. Clique em <b>“Salvar alterações”</b> abaixo para confirmar.
            </p>
          )}
        </div>

        <Field label="Seção">
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-primary/50"
          >
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </Field>

        <Field label="Título">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Aula 1 — Boas-vindas"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-primary/50"
          />
        </Field>

        <Field label="Autor / mentor (opcional)">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Ex.: Time LURE"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-primary/50"
          />
        </Field>

        <Field label="Link do YouTube">
          <div className="relative">
            <Youtube className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${ytOk ? "text-muted-foreground" : "text-red-400"}`} />
            <input
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className={`w-full rounded-xl border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-primary/50 ${
                ytOk ? "border-border" : "border-red-500/50"
              }`}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Dica: suba o vídeo como <b>Não listado</b> no YouTube. No site ele aparece sem marca do YouTube.
          </p>
        </Field>

        <Field label="Descrição (opcional)">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Sobre o que é este módulo…"
            className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-primary/50"
          />
        </Field>

        {msg && (
          <div
            className={`rounded-lg border px-3 py-2.5 text-sm ${
              msg.type === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {msg.text}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {isEdit ? "Salvar alterações" : "Adicionar módulo"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

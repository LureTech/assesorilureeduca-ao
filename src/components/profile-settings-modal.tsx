import { useEffect, useReducer, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  X,
  Camera,
  Loader2,
  Check,
  Crown,
  ShieldCheck,
  Mail,
  Trash2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Avatar, uploadAvatar, validateAvatarFile } from "./avatar";
import { NotificationSettings } from "./notifications";

/* ---------------- Store global (abrir de qualquer lugar) ---------------- */

let openState = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openSettings() {
  openState = true;
  emit();
}
function setClosed() {
  openState = false;
  emit();
}
export function useSettingsOpen() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return openState;
}

/* ---------------- Modal ---------------- */

export function ProfileSettingsModal() {
  const open = useSettingsOpen();
  const { profile, session, isAdmin, refreshProfile } = useAuth();

  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sincroniza o formulário sempre que abre.
  useEffect(() => {
    if (open && profile) {
      setName(profile.full_name || "");
      setFile(null);
      setPreview(null);
      setRemovePhoto(false);
      setMsg(null);
    }
  }, [open, profile]);

  // Fecha no ESC + trava o scroll do fundo.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setClosed();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Libera as URLs de preview.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  if (!open || !profile || !session?.user) return null;

  const email = profile.email || session.user.email || "";
  const currentUrl = removePhoto ? null : preview || profile.avatar_url;

  const pickFile = (f: File | null) => {
    if (!f) return;
    const err = validateAvatarFile(f);
    if (err) {
      setMsg({ type: "err", text: err });
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setRemovePhoto(false);
    setMsg(null);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      let avatar_url: string | null = profile.avatar_url;
      if (file) avatar_url = await uploadAvatar(file, session.user.id);
      else if (removePhoto) avatar_url = null;

      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name.trim() || null, avatar_url })
        .eq("id", session.user.id);
      if (error) throw error;

      await refreshProfile();
      setMsg({ type: "ok", text: "Perfil atualizado!" });
      setTimeout(() => setClosed(), 650);
    } catch (e) {
      setMsg({ type: "err", text: (e as Error)?.message || "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dark-scope fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !saving && setClosed()}
      />

      {/* Card */}
      {/* max-h + rolagem: o bloco de notificações deixou o card mais alto que a tela do celular */}
      <div className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85)] sm:max-h-[88vh] sm:rounded-3xl">
        {/* Faixa superior com brilho */}
        <div className="relative h-24 overflow-hidden bg-gradient-to-br from-primary/25 via-surface-elevated to-background">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 120% at 50% -10%, rgba(187, 154, 53, 0.35), transparent 70%)",
            }}
          />
          <button
            onClick={() => !saving && setClosed()}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-border/60 bg-background/50 text-muted-foreground backdrop-blur transition hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6">
          {/* Avatar sobreposto + botão de trocar */}
          <div className="-mt-12 flex flex-col items-center">
            <div className="group relative">
              <Avatar
                url={currentUrl}
                name={name || profile.full_name}
                email={email}
                className="h-24 w-24 ring-4 ring-card"
                textClassName="text-2xl"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={saving}
                className="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100"
                aria-label="Trocar foto"
              >
                <Camera className="h-6 w-6" />
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={saving}
                className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full gradient-gold text-primary-foreground shadow-[var(--shadow-glow)] ring-2 ring-card transition hover:brightness-110"
                aria-label="Adicionar foto"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40"
              >
                <Camera className="h-3.5 w-3.5" /> {currentUrl ? "Trocar foto" : "Adicionar foto"}
              </button>
              {currentUrl && (
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setRemovePhoto(true);
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </button>
              )}
            </div>

            {/* Badge de papel */}
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              {isAdmin ? <Crown className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isAdmin ? "Administrador" : "Membro"}
            </span>
          </div>

          {/* Campos */}
          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">E-mail</label>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="truncate">{email}</span>
              </div>
            </div>
          </div>

          <NotificationSettings />

          {msg && (
            <div
              className={`mt-4 rounded-lg border px-3 py-2.5 text-sm ${
                msg.type === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* Ações */}
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Salvar alterações
                </>
              )}
            </button>

            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setClosed()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/40"
              >
                <ShieldCheck className="h-4 w-4" /> Gerenciar acessos
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

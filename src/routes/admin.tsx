import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  UserPlus,
  ShieldCheck,
  Users,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  Ban,
  Crown,
  RefreshCw,
  Camera,
  Trash2,
  Mail,
  Lock,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, type Profile, type Role } from "@/lib/supabase";
import { Avatar, uploadAvatar, validateAvatarFile } from "@/components/avatar";
import lureLogo from "@/assets/lure-logo-large.png.asset.json";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Administração — LURE Growth" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoadingList(true);
    setListError(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, role, active, created_at")
      .order("created_at", { ascending: true });
    if (error) setListError(error.message);
    else setUsers((data as Profile[]) ?? []);
    setLoadingList(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 pb-3 backdrop-blur-xl md:px-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Link>
          <div className="hidden h-6 w-px bg-border md:block" />
          <div className="hidden items-center gap-2 md:flex">
            <img src={lureLogo.url} alt="Lure" className="h-6 w-6 object-contain" />
            <span className="text-sm font-semibold tracking-wider">Administração</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/modulos"
            className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            Módulos →
          </Link>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-8 md:px-10 lg:py-12">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Gerenciar acessos
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Crie contas para novos membros com e-mail e senha, e libere ou bloqueie o acesso quando
            quiser.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <CreateUserCard onCreated={loadUsers} />
          <UsersCard
            users={users}
            loading={loadingList}
            error={listError}
            myId={me?.id}
            onChanged={loadUsers}
          />
        </div>
      </main>
    </div>
  );
}

/* ---------------- Criar usuário ---------------- */

function CreateUserCard({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const pickPhoto = (f: File | null) => {
    if (!f) return;
    const err = validateAvatarFile(f);
    if (err) {
      setMsg({ type: "err", text: err });
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
    setMsg(null);
  };

  const clearPhoto = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const reset = () => {
    setEmail("");
    setFullName("");
    setPassword("");
    setRole("member");
    clearPhoto();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { email, password, full_name: fullName, role },
    });

    if (error) {
      // A Edge Function devolve a mensagem de erro no corpo (JSON).
      let text = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          if (body?.error) text = body.error;
        }
      } catch {
        /* mantém a mensagem padrão */
      }
      setLoading(false);
      setMsg({ type: "err", text });
      return;
    }
    if ((data as { error?: string })?.error) {
      setLoading(false);
      setMsg({ type: "err", text: (data as { error: string }).error });
      return;
    }

    // Se o admin escolheu uma foto, envia agora usando o id recém-criado.
    const newId = (data as { user?: { id?: string } })?.user?.id;
    if (photo && newId) {
      try {
        const url = await uploadAvatar(photo, newId);
        await supabase.from("profiles").update({ avatar_url: url }).eq("id", newId);
      } catch {
        // A conta foi criada; só a foto falhou. Não bloqueia o fluxo.
        setMsg({
          type: "ok",
          text: `Conta criada para ${email}, mas a foto não subiu. Você pode adicioná-la depois.`,
        });
        setLoading(false);
        reset();
        onCreated();
        return;
      }
    }

    setLoading(false);
    setMsg({
      type: "ok",
      text: `Conta criada para ${email}. Já pode entrar com a senha definida.`,
    });
    reset();
    onCreated();
  };

  return (
    <div className="h-fit overflow-hidden rounded-2xl border border-border bg-card">
      {/* Cabeçalho com brilho */}
      <div className="relative border-b border-border bg-gradient-to-br from-primary/15 via-card to-card px-6 py-5">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 120% at 15% -20%, rgba(187, 154, 53, 0.25), transparent 70%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl gradient-gold text-primary-foreground shadow-[var(--shadow-glow)]">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Nova conta</h2>
            <p className="text-xs text-muted-foreground">Cadastre um cliente em segundos</p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5 p-6">
        {/* Foto do cliente */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative shrink-0"
            aria-label="Adicionar foto"
          >
            <Avatar
              url={preview}
              name={fullName}
              email={email || "?"}
              className="h-16 w-16 ring-2 ring-border transition group-hover:ring-primary/50"
              textClassName="text-lg"
            />
            <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full gradient-gold text-primary-foreground shadow ring-2 ring-card">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium">Foto do cliente</p>
            <p className="text-xs text-muted-foreground">Opcional — JPG ou PNG até 5 MB.</p>
            {preview && (
              <button
                type="button"
                onClick={clearPhoto}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-red-400 transition hover:text-red-300"
              >
                <Trash2 className="h-3 w-3" /> Remover
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
          />
        </div>

        <Field label="Nome">
          <IconInput icon={<User className="h-4 w-4" />}>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex.: João Silva"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </IconInput>
        </Field>
        <Field label="E-mail">
          <IconInput icon={<Mail className="h-4 w-4" />}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="joao@email.com"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </IconInput>
        </Field>
        <Field label="Senha">
          <IconInput icon={<Lock className="h-4 w-4" />}>
            <input
              type={showPw ? "text" : "password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 6 caracteres"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="text-muted-foreground transition hover:text-foreground"
              aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </IconInput>
        </Field>
        <Field label="Tipo de conta">
          <div className="grid grid-cols-2 gap-2">
            <RoleOption
              active={role === "member"}
              onClick={() => setRole("member")}
              icon={<Users className="h-4 w-4" />}
              label="Membro"
            />
            <RoleOption
              active={role === "admin"}
              onClick={() => setRole("admin")}
              icon={<Crown className="h-4 w-4" />}
              label="Admin"
            />
          </div>
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
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Criando…
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" /> Criar conta
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function IconInput({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 transition focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      {children}
    </div>
  );
}

/* ---------------- Lista de usuários ---------------- */

function UsersCard({
  users,
  loading,
  error,
  myId,
  onChanged,
}: {
  users: Profile[];
  loading: boolean;
  error: string | null;
  myId?: string;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleActive = async (u: Profile) => {
    setBusyId(u.id);
    await supabase.from("profiles").update({ active: !u.active }).eq("id", u.id);
    setBusyId(null);
    onChanged();
  };

  const sorted = useMemo(
    () => [...users].sort((a, b) => (a.role === "admin" ? -1 : 1) - (b.role === "admin" ? -1 : 1)),
    [users],
  );

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-surface text-muted-foreground">
            <Users className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Contas</h2>
            <p className="text-xs text-muted-foreground">{users.length} no total</p>
          </div>
        </div>
        <button
          onClick={onChanged}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando contas…
        </div>
      ) : error ? (
        <div className="px-6 py-10 text-sm text-red-400">Erro ao carregar: {error}</div>
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((u) => {
            const isMe = u.id === myId;
            return (
              <li key={u.id} className="flex items-center gap-4 px-6 py-4">
                <Avatar
                  url={u.avatar_url}
                  name={u.full_name}
                  email={u.email}
                  className="h-10 w-10"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {u.full_name || u.email.split("@")[0]}
                    </span>
                    {u.role === "admin" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        <Crown className="h-3 w-3" /> Admin
                      </span>
                    )}
                    {isMe && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        você
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                </div>

                <span
                  className={`hidden items-center gap-1 text-xs font-medium sm:inline-flex ${
                    u.active ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {u.active ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Ban className="h-3.5 w-3.5" />
                  )}
                  {u.active ? "Ativo" : "Bloqueado"}
                </span>

                <button
                  onClick={() => toggleActive(u)}
                  disabled={isMe || busyId === u.id}
                  title={
                    isMe
                      ? "Você não pode bloquear a própria conta"
                      : u.active
                        ? "Bloquear acesso"
                        : "Liberar acesso"
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    u.active
                      ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                      : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  }`}
                >
                  {busyId === u.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : u.active ? (
                    <Ban className="h-3.5 w-3.5" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {u.active ? "Bloquear" : "Liberar"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Bits ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function RoleOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-surface text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

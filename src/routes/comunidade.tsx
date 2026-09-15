import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Heart,
  MessageCircle,
  Image as ImageIcon,
  Loader2,
  Send,
  Trash2,
  TrendingUp,
  X,
  ArrowUp,
} from "lucide-react";
import { Sidebar, TopBar, MobileTopBar, MobileTabBar } from "./index";
import { Avatar } from "@/components/avatar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatBytes, validatePostImage } from "@/lib/image-compress";
import {
  CATEGORIES,
  MAX_COMMENT_LENGTH,
  MAX_POST_LENGTH,
  PAGE_SIZE,
  POSTS_PER_DAY,
  createComment,
  createPost,
  deleteComment,
  deletePost,
  listComments,
  listPosts,
  loadStats,
  timeAgo,
  toggleLike,
  uploadPostImage,
  type Category,
  type CommunityStats,
  type Post,
  type PostComment,
} from "@/lib/community";

export const Route = createFileRoute("/comunidade")({
  head: () => ({
    meta: [
      { title: "Comunidade — LURE Growth" },
      {
        name: "description",
        content: "Compartilhe conquistas, dúvidas e insights com os alunos da Lure Digital.",
      },
      { property: "og:title", content: "Comunidade LURE" },
      { property: "og:description", content: "O feed da comunidade de marketing digital da Lure." },
    ],
  }),
  component: ComunidadePage,
});

const FILTROS = ["Todos", ...CATEGORIES] as const;
type Filtro = (typeof FILTROS)[number];

/** Imagem já comprimida, esperando o "Publicar". */
type ImagemPronta = {
  url: string;
  path: string;
  width: number;
  height: number;
  previewUrl: string;
  bytes: number;
  originalBytes: number;
};

function ComunidadePage() {
  const { session, profile, isAdmin } = useAuth();
  const userId = session?.user?.id;

  const autor = useMemo(
    () => ({
      id: userId ?? "",
      name: profile?.full_name?.trim() || profile?.email?.split("@")[0] || "Aluno",
      avatar: profile?.avatar_url ?? null,
    }),
    [userId, profile],
  );

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [posts, setPosts] = useState<Post[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [acabou, setAcabou] = useState(false);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [novidades, setNovidades] = useState(0);
  const [erroFeed, setErroFeed] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroFeed(null);
    try {
      const lista = await listPosts({ category: filtro, userId });
      setPosts(lista);
      setAcabou(lista.length < PAGE_SIZE);
      setNovidades(0);
    } catch (e) {
      setErroFeed((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtro, userId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atualizarStats = useCallback(() => {
    void loadStats().then(setStats);
  }, []);
  useEffect(atualizarStats, [atualizarStats]);

  // Feed ao vivo: post de outra pessoa vira um aviso no topo, sem empurrar
  // o que a pessoa está lendo.
  useEffect(() => {
    const canal = supabase
      .channel("comunidade-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_posts" },
        (payload) => {
          const novo = payload.new as Post;
          if (novo.user_id === userId) return;
          if (filtro !== "Todos" && novo.category !== filtro) return;
          setNovidades((n) => n + 1);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [filtro, userId]);

  const carregarMais = async () => {
    const ultimo = posts[posts.length - 1];
    if (!ultimo || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const mais = await listPosts({ category: filtro, before: ultimo.created_at, userId });
      setPosts((p) => [...p, ...mais]);
      if (mais.length < PAGE_SIZE) setAcabou(true);
    } catch (e) {
      setErroFeed((e as Error).message);
    } finally {
      setCarregandoMais(false);
    }
  };

  const aoPublicar = (post: Post) => {
    setPosts((p) => (filtro === "Todos" || post.category === filtro ? [post, ...p] : p));
    atualizarStats();
  };

  const curtir = async (post: Post) => {
    if (!userId) return;
    const curtido = !!post.liked;
    // Otimista: o coração responde na hora, o banco confirma depois.
    setPosts((lista) =>
      lista.map((p) =>
        p.id === post.id
          ? { ...p, liked: !curtido, likes_count: Math.max(0, p.likes_count + (curtido ? -1 : 1)) }
          : p,
      ),
    );
    try {
      await toggleLike(post.id, userId, curtido);
    } catch {
      setPosts((lista) =>
        lista.map((p) =>
          p.id === post.id
            ? { ...p, liked: curtido, likes_count: Math.max(0, p.likes_count + (curtido ? 1 : -1)) }
            : p,
        ),
      );
    }
  };

  const remover = async (post: Post) => {
    if (!confirm("Apagar esta publicação?")) return;
    const antes = posts;
    setPosts((p) => p.filter((x) => x.id !== post.id));
    try {
      await deletePost(post);
      atualizarStats();
    } catch (e) {
      setPosts(antes);
      setErroFeed((e as Error).message);
    }
  };

  const restantes = stats ? Math.max(0, POSTS_PER_DAY - stats.my_posts_24h) : null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        current="/comunidade"
      />

      <main className="relative flex min-h-screen flex-1 flex-col">
        <div className="hidden lg:block">
          <TopBar />
        </div>
        <div className="lg:hidden">
          <MobileTopBar />
        </div>

        <section className="px-6 pt-14 pb-8 md:px-14 md:pt-20 md:pb-12">
          <div className="mx-auto max-w-5xl">
            <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
              Comunidade · Temporada 2026
            </div>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
              Onde alunos <span className="italic text-primary/90">crescem juntos.</span>
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
              Um espaço editorial para conquistas, dúvidas e insights da rede Lure. Sem ruído.
            </p>

            <div className="mt-10 flex items-center gap-10 border-t border-border/40 pt-6 text-sm">
              <Stat value={stats ? compacto(stats.members) : "—"} label="Membros" />
              <div className="h-8 w-px bg-border/40" />
              <Stat value={stats ? String(stats.posts_today) : "—"} label="Posts hoje" />
              <div className="h-8 w-px bg-border/40" />
              <Stat value={stats ? compacto(stats.posts_total) : "—"} label="No total" />
            </div>
          </div>
        </section>

        <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-14 px-6 pb-16 md:px-14 lg:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-8">
            <Composer autor={autor} restantes={restantes} onPublicar={aoPublicar} />

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
              {FILTROS.map((c) => (
                <button
                  key={c}
                  onClick={() => setFiltro(c)}
                  className={`relative py-1 transition ${
                    filtro === c
                      ? "text-foreground"
                      : "text-muted-foreground/70 hover:text-foreground"
                  }`}
                >
                  {c}
                  {filtro === c && (
                    <span className="absolute -bottom-0.5 left-0 right-0 h-px bg-primary" />
                  )}
                </button>
              ))}
            </div>

            {novidades > 0 && (
              <button
                onClick={carregar}
                className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-[12px] font-medium text-primary transition hover:bg-primary/15"
              >
                <ArrowUp className="h-3.5 w-3.5" />
                {novidades === 1 ? "1 publicação nova" : `${novidades} publicações novas`}
              </button>
            )}

            {erroFeed && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                {erroFeed}
              </div>
            )}

            <div className="flex flex-col">
              {carregando ? (
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando o feed…
                </div>
              ) : posts.length === 0 ? (
                <div className="border-t border-border/40 py-16 text-center">
                  <MessageCircle className="mx-auto h-6 w-6 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    {filtro === "Todos"
                      ? "Ninguém publicou ainda. Seja o primeiro."
                      : `Nada em “${filtro}” por enquanto.`}
                  </p>
                </div>
              ) : (
                posts.map((p, i) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    primeiro={i === 0}
                    autor={autor}
                    podeApagar={isAdmin || p.user_id === userId}
                    onCurtir={() => curtir(p)}
                    onApagar={() => remover(p)}
                    onContagemComentarios={(n) =>
                      setPosts((lista) =>
                        lista.map((x) => (x.id === p.id ? { ...x, comments_count: n } : x)),
                      )
                    }
                  />
                ))
              )}

              {!carregando && posts.length > 0 && !acabou && (
                <button
                  onClick={carregarMais}
                  disabled={carregandoMais}
                  className="mt-6 inline-flex items-center justify-center gap-2 border-t border-border/30 py-6 text-[13px] text-muted-foreground transition hover:text-foreground disabled:opacity-60"
                >
                  {carregandoMais && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Carregar mais
                </button>
              )}
            </div>
          </div>

          <aside className="hidden flex-col gap-10 pt-2 lg:flex">
            <div>
              <div className="mb-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                <TrendingUp className="h-3 w-3" /> Em alta
              </div>
              {stats?.tags?.length ? (
                <ul className="flex flex-col divide-y divide-border/30">
                  {stats.tags.map((t) => (
                    <li
                      key={t.tag}
                      className="flex items-baseline justify-between py-2.5 text-[13px]"
                    >
                      <span className="text-foreground">
                        <span className="text-muted-foreground/50">#</span>
                        {t.tag}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground/60">
                        {t.n}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] leading-relaxed text-muted-foreground/70">
                  Use #hashtag nos posts pra abrir os assuntos do mês aqui.
                </p>
              )}
            </div>

            <div className="border-t border-border/40 pt-6 text-[11px] leading-relaxed text-muted-foreground/70">
              <div className="mb-2 font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Como funciona
              </div>
              <ul className="space-y-1.5">
                <li>Até {MAX_POST_LENGTH} caracteres por publicação.</li>
                <li>{POSTS_PER_DAY} publicações por dia, 30s entre uma e outra.</li>
                <li>Uma imagem por post — comprimida automaticamente.</li>
                <li>Respeito acima de tudo. Zero spam.</li>
              </ul>
            </div>
          </aside>
        </div>

        <div className="lg:hidden">
          <MobileTabBar current="/comunidade" />
        </div>
      </main>
    </div>
  );
}

function compacto(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`.replace(".0", "");
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="leading-tight">
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
        {label}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Composer                                                             */
/* ------------------------------------------------------------------ */

function Composer({
  autor,
  restantes,
  onPublicar,
}: {
  autor: { id: string; name: string; avatar: string | null };
  restantes: number | null;
  onPublicar: (p: Post) => void;
}) {
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState<Category>("Insight");
  const [imagem, setImagem] = useState<ImagemPronta | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const restante = MAX_POST_LENGTH - texto.length;
  const excedeu = restante < 0;
  const semCota = restantes !== null && restantes <= 0;
  const podeEnviar =
    (texto.trim().length > 0 || !!imagem) && !excedeu && !publicando && !preparando;

  useEffect(
    () => () => {
      if (imagem) URL.revokeObjectURL(imagem.previewUrl);
    },
    [imagem],
  );

  const escolherImagem = async (file: File | null) => {
    if (!file || !autor.id) return;
    const problema = validatePostImage(file);
    if (problema) return setErro(problema);

    setErro(null);
    setPreparando(true);
    try {
      const enviada = await uploadPostImage(file, autor.id);
      setImagem({
        url: enviada.url,
        path: enviada.path,
        width: enviada.width,
        height: enviada.height,
        previewUrl: URL.createObjectURL(enviada.compressed.file),
        bytes: enviada.compressed.bytes,
        originalBytes: enviada.compressed.originalBytes,
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setPreparando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const tirarImagem = async () => {
    if (!imagem) return;
    URL.revokeObjectURL(imagem.previewUrl);
    const path = imagem.path;
    setImagem(null);
    // A imagem já foi pro storage; sem isso ela ficaria órfã lá.
    await supabase.storage.from("community").remove([path]);
  };

  const publicar = async () => {
    if (!podeEnviar || !autor.id) return;
    setPublicando(true);
    setErro(null);
    try {
      const post = await createPost({ body: texto, category: categoria, image: imagem }, autor);
      onPublicar(post);
      setTexto("");
      if (imagem) URL.revokeObjectURL(imagem.previewUrl);
      setImagem(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="border-b border-border/40 pb-6">
      <div className="flex gap-4">
        <Avatar url={autor.avatar} name={autor.name} className="h-10 w-10" />

        <div className="min-w-0 flex-1">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Compartilhe uma conquista, um insight ou uma dúvida…"
            rows={2}
            className="w-full resize-none border-0 bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:ring-0"
          />

          {imagem && (
            <div className="relative mt-3 inline-block max-w-full overflow-hidden rounded-lg border border-border/60">
              <img
                src={imagem.previewUrl}
                alt=""
                className="max-h-64 w-auto max-w-full object-contain"
              />
              <button
                onClick={tirarImagem}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white transition hover:bg-black"
                aria-label="Remover imagem"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white/90">
                {formatBytes(imagem.originalBytes)} → {formatBytes(imagem.bytes)}
              </div>
            </div>
          )}

          {preparando && (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Comprimindo e enviando a imagem…
            </div>
          )}

          {/* Categorias */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategoria(c)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  categoria === c
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground/80 hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 text-muted-foreground/70">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!!imagem || preparando}
                className="rounded-md p-2 transition hover:text-foreground disabled:opacity-40"
                title={imagem ? "Uma imagem por post" : "Adicionar imagem"}
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void escolherImagem(e.target.files?.[0] ?? null)}
              />
              <span
                className={`text-[11px] tabular-nums ${
                  excedeu
                    ? "text-red-400"
                    : restante <= 50
                      ? "text-primary"
                      : "text-muted-foreground/60"
                }`}
              >
                {restante}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {restantes !== null && restantes <= 3 && (
                <span className="text-[11px] text-muted-foreground/70">
                  {restantes === 0 ? "Limite de hoje atingido" : `${restantes} restantes hoje`}
                </span>
              )}
              <button
                onClick={publicar}
                disabled={!podeEnviar || semCota}
                className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {publicando ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Publicar
              </button>
            </div>
          </div>

          {erro && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] leading-relaxed text-red-400">
              {erro}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Post                                                                 */
/* ------------------------------------------------------------------ */

function PostCard({
  post,
  primeiro,
  autor,
  podeApagar,
  onCurtir,
  onApagar,
  onContagemComentarios,
}: {
  post: Post;
  primeiro: boolean;
  autor: { id: string; name: string; avatar: string | null };
  podeApagar: boolean;
  onCurtir: () => void;
  onApagar: () => void;
  onContagemComentarios: (n: number) => void;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <article className={`group py-8 ${primeiro ? "" : "border-t border-border/30"}`}>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar url={post.author_avatar} name={post.author_name} className="h-9 w-9" />
          <div className="leading-tight">
            <div className="text-[13px] font-medium">{post.author_name}</div>
            <div className="text-[11px] text-muted-foreground/70">{timeAgo(post.created_at)}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary/80">
            {post.category}
          </span>
          {podeApagar && (
            <button
              onClick={onApagar}
              className="rounded-md p-1 text-muted-foreground/60 opacity-0 transition hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
              aria-label="Apagar publicação"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {post.body && (
        <p className="mt-5 whitespace-pre-line break-words text-[15px] leading-[1.7] text-foreground/90">
          {post.body}
        </p>
      )}

      {post.image_url && (
        <div className="mt-5 overflow-hidden rounded-lg border border-border/40">
          <img
            src={post.image_url}
            alt=""
            loading="lazy"
            width={post.image_w ?? undefined}
            height={post.image_h ?? undefined}
            // Reserva o espaço antes de carregar, pro feed não pular.
            style={
              post.image_w && post.image_h
                ? { aspectRatio: `${post.image_w} / ${post.image_h}` }
                : undefined
            }
            className="h-auto w-full object-cover"
          />
        </div>
      )}

      <footer className="mt-5 flex items-center gap-5 text-[12px] text-muted-foreground/70">
        <button
          onClick={onCurtir}
          className={`inline-flex items-center gap-1.5 transition hover:text-foreground ${
            post.liked ? "text-primary" : ""
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${post.liked ? "fill-current" : ""}`} />
          <span className="tabular-nums">{post.likes_count}</span>
        </button>
        <button
          onClick={() => setAberto((v) => !v)}
          className={`inline-flex items-center gap-1.5 transition hover:text-foreground ${
            aberto ? "text-foreground" : ""
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="tabular-nums">{post.comments_count}</span>
        </button>
      </footer>

      {aberto && (
        <Comentarios
          postId={post.id}
          autor={autor}
          podeModerar={podeApagar}
          onContagem={onContagemComentarios}
        />
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Comentários                                                          */
/* ------------------------------------------------------------------ */

function Comentarios({
  postId,
  autor,
  podeModerar,
  onContagem,
}: {
  postId: string;
  autor: { id: string; name: string; avatar: string | null };
  podeModerar: boolean;
  onContagem: (n: number) => void;
}) {
  const [lista, setLista] = useState<PostComment[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listComments(postId)
      .then((c) => {
        if (!vivo) return;
        setLista(c);
        onContagem(c.length);
      })
      .catch((e) => vivo && setErro((e as Error).message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
    // onContagem muda a cada render do pai; incluir aqui recarregaria em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const corpo = texto.trim();
    if (!corpo || !autor.id) return;
    setEnviando(true);
    setErro(null);
    try {
      const novo = await createComment(postId, corpo, autor);
      setLista((c) => {
        const atual = [...c, novo];
        onContagem(atual.length);
        return atual;
      });
      setTexto("");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const remover = async (c: PostComment) => {
    const antes = lista;
    const restante = lista.filter((x) => x.id !== c.id);
    setLista(restante);
    onContagem(restante.length);
    try {
      await deleteComment(c.id);
    } catch (e) {
      setLista(antes);
      onContagem(antes.length);
      setErro((e as Error).message);
    }
  };

  const restante = MAX_COMMENT_LENGTH - texto.length;

  return (
    <div className="mt-6 border-l border-border/40 pl-5">
      {carregando ? (
        <div className="flex items-center gap-2 py-3 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {lista.map((c) => (
            <div key={c.id} className="group/c flex gap-3">
              <Avatar
                url={c.author_avatar}
                name={c.author_name}
                className="h-7 w-7"
                textClassName="text-[10px]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-medium">{c.author_name}</span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {timeAgo(c.created_at)}
                  </span>
                  {(podeModerar || c.user_id === autor.id) && (
                    <button
                      onClick={() => remover(c)}
                      className="ml-auto text-muted-foreground/50 opacity-0 transition hover:text-red-400 group-hover/c:opacity-100"
                      aria-label="Apagar comentário"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-line break-words text-[13px] leading-relaxed text-foreground/85">
                  {c.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={enviar} className="mt-4 flex items-start gap-3">
        <Avatar
          url={autor.avatar}
          name={autor.name}
          className="h-7 w-7"
          textClassName="text-[10px]"
        />
        <div className="min-w-0 flex-1">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
            placeholder="Escreva um comentário…"
            className="w-full border-0 border-b border-border/50 bg-transparent pb-1.5 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] tabular-nums text-muted-foreground/50">
              {restante < 60 ? restante : ""}
            </span>
            <button
              type="submit"
              disabled={!texto.trim() || enviando}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary transition hover:brightness-125 disabled:opacity-30"
            >
              {enviando ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              Enviar
            </button>
          </div>
        </div>
      </form>

      {erro && <div className="mt-2 text-[11px] text-red-400">{erro}</div>}
    </div>
  );
}

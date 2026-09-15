import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  Play,
  CheckCircle2,
  Circle,
  Lock,
  Award,
  MessageCircle,
  Send,
  FileText,
  Download,
  Clock,
  Youtube,
  Pencil,
  Loader2,
  Trash2,
  Plus,
  X,
  ListChecks,
  LifeBuoy,
  ArrowRight,
} from "lucide-react";
import lureLogo from "@/assets/lure-logo-large.png.asset.json";
import { useAuth } from "@/lib/auth";
import { isDemoMode, supabase } from "@/lib/supabase";
import { toYouTubeEmbed } from "@/lib/youtube";
import { Avatar, initialsOf } from "@/components/avatar";
import { openSettings } from "@/components/profile-settings-modal";
import { LurePlayer } from "@/components/lure-player";
import { InlineTitle, InlineText } from "@/components/inline-edit";
import { uploadMaterial, validateMaterialFile } from "@/lib/sections";
import { AULAS_FIXAS, PROVA_N } from "@/lib/aulas";

export const Route = createFileRoute("/curso/$slug")({
  head: ({ params }) => {
    const title = deslug(params.slug);
    return {
      meta: [
        { title: `${title} — LURE Growth` },
        { name: "description", content: `Curso ${title} na plataforma oficial da Lure Digital.` },
        { property: "og:title", content: `${title} — LURE Growth` },
        {
          property: "og:description",
          content: `Assista às aulas do módulo ${title} com o time LURE.`,
        },
      ],
    };
  },
  component: CoursePage,
});

function deslug(slug: string) {
  return slug
    .split("-")
    .map((w) => (w.length <= 2 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

type LessonMeta = { url?: string; title?: string; description?: string; duration?: number };

/** Segundos -> "m:ss" (ou "h:mm:ss"). Devolve undefined quando nao ha duracao. */
function fmtDuration(secs?: number) {
  if (!secs || secs <= 0) return undefined;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const sec = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
    : `${m}:${sec.toString().padStart(2, "0")}`;
}

type Lesson = {
  n: number;
  title: string;
  duration: string;
  done?: boolean;
  locked?: boolean;
  kind?: "video" | "prova";
};

/** As cinco aulas que todo curso já nasce tendo (`AULAS_FIXAS`). Da sexta em
 *  diante é o admin quem cria, e a aula passa a existir como linha em
 *  `lesson_videos`. Quem conta isso pro resto do app é `totalDeAulas`. */
const AULAS_BASE: Lesson[] = [
  { n: 1, title: "Aula 1", duration: "—" },
  { n: 2, title: "Aula 2", duration: "—" },
  { n: 3, title: "Aula 3", duration: "—" },
  { n: 4, title: "Aula 4", duration: "—" },
  { n: 5, title: "Aula 5", duration: "—" },
];

const PROVA: Lesson = {
  n: PROVA_N,
  title: "Prova Final — Certificado de Conclusão",
  duration: "—",
  locked: true,
  kind: "prova",
};

type Comment = {
  id: string;
  body: string;
  author_name: string;
  user_id: string;
  created_at: string;
};

function CoursePage() {
  const { slug } = Route.useParams();
  const courseTitle = deslug(slug);
  const { session, profile, isAdmin } = useAuth();
  const [currentLesson, setCurrentLesson] = useState(1);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  /** Onde o aluno parou em cada aula (segundos), vindo do banco. */
  const [resumeAt, setResumeAt] = useState<Record<number, number>>({});
  // Metadados por aula (vídeo + título/descrição editáveis + duração), do banco
  const [videos, setVideos] = useState<Record<number, LessonMeta>>({});

  // A grade do curso: as cinco fixas mais o que o admin criou. Uma aula nova
  // existe porque tem linha em `lesson_videos` — é de lá que ela aparece aqui.
  const lessons = useMemo(() => {
    const extras = Object.keys(videos)
      .map(Number)
      .filter((n) => n > AULAS_FIXAS && n !== PROVA_N)
      .sort((a, b) => a - b)
      .map<Lesson>((n) => ({ n, title: `Aula ${n}`, duration: "—" }));
    return [...AULAS_BASE, ...extras, PROVA];
  }, [videos]);

  // Se a aula aberta some (o admin apagou), cai na primeira em vez de quebrar.
  const active = lessons.find((l) => l.n === currentLesson) ?? lessons[0];
  const doneCount = completed.size;
  // A prova fica fora da conta — ninguem a conclui, e com ela no divisor o
  // aluno que terminasse tudo parava em 94%. E o mesmo total que o card mostra.
  const totalAulas = lessons.filter((l) => l.kind !== "prova").length;
  const progress = totalAulas ? Math.round((doneCount / totalAulas) * 100) : 0;
  const isCurrentDone = completed.has(active.n);
  const nextLesson = lessons.find((l) => l.n > active.n && !l.locked);
  const isLast = !nextLesson;

  const toggleComplete = (n: number) => {
    const willComplete = !completed.has(n);
    setCompleted((prev) => {
      const next = new Set(prev);
      if (willComplete) next.add(n);
      else next.delete(n);
      return next;
    });
    // Grava na hora — nao espera o proximo flush do cronometro
    const uid = session?.user?.id;
    if (!uid) return;
    void supabase.from("lesson_progress").upsert(
      {
        user_id: uid,
        course_slug: slug,
        lesson_n: n,
        completed: willComplete,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,course_slug,lesson_n" },
    );
  };

  const goNext = () => {
    if (nextLesson) setCurrentLesson(nextLesson.n);
  };

  const currentMeta = videos[currentLesson] ?? {};
  const currentUrl = currentMeta.url;

  const DEFAULT_DESC =
    "Assista à aula e marque como concluída quando terminar.";
  const displayTitle = currentMeta.title || active.title;
  const displayDesc = currentMeta.description || DEFAULT_DESC;
  const displayDuration = fmtDuration(currentMeta.duration) ?? active.duration;

  const loadVideos = useCallback(async () => {
    const { data } = await supabase
      .from("lesson_videos")
      .select("lesson_n, youtube_url, title, description, duration_seconds")
      .eq("course_slug", slug);
    const map: Record<number, LessonMeta> = {};
    (data ?? []).forEach(
      (r: {
        lesson_n: number;
        youtube_url: string | null;
        title: string | null;
        description: string | null;
        duration_seconds: number | null;
      }) => {
        map[r.lesson_n] = {
          url: r.youtube_url ?? undefined,
          title: r.title ?? undefined,
          description: r.description ?? undefined,
          duration: r.duration_seconds ?? undefined,
        };
      },
    );
    setVideos(map);
  }, [slug]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  const saveLessonMeta = useCallback(
    async (patch: Record<string, unknown>) => {
      await supabase.from("lesson_videos").upsert(
        {
          course_slug: slug,
          lesson_n: currentLesson,
          updated_by: session?.user?.id ?? null,
          updated_at: new Date().toISOString(),
          ...patch,
        },
        { onConflict: "course_slug,lesson_n" },
      );
      await loadVideos();
    },
    [slug, currentLesson, session?.user?.id, loadVideos],
  );

  const saveVideo = (url: string) => saveLessonMeta({ youtube_url: url || null });

  /** Cria a próxima aula do curso e já abre ela pro admin colar o vídeo. */
  const addLesson = useCallback(async () => {
    const usados = Object.keys(videos)
      .map(Number)
      .filter((n) => n !== PROVA_N);
    const proximo = Math.max(AULAS_FIXAS, ...usados) + 1;
    const { error } = await supabase.from("lesson_videos").insert({
      course_slug: slug,
      lesson_n: proximo,
      title: `Aula ${proximo}`,
      updated_by: session?.user?.id ?? null,
    });
    if (error) return;
    await loadVideos();
    setCurrentLesson(proximo);
  }, [videos, slug, session?.user?.id, loadVideos]);

  /** Só vale pras aulas criadas depois das cinco fixas — as base não somem. */
  const removeLesson = useCallback(
    async (n: number) => {
      if (n <= AULAS_FIXAS) return;
      if (!window.confirm(`Remover a aula ${n} deste curso?`)) return;
      await supabase.from("lesson_videos").delete().eq("course_slug", slug).eq("lesson_n", n);
      await loadVideos();
      setCurrentLesson((atual) => (atual === n ? 1 : atual));
    },
    [slug, loadVideos],
  );

  // Captura a duração do próprio vídeo do YouTube e guarda no banco.
  const onVideoDuration = useCallback(
    (secs: number) => {
      const r = Math.round(secs);
      if (r > 0 && Math.abs((currentMeta.duration ?? 0) - r) > 2)
        saveLessonMeta({ duration_seconds: r });
    },
    [currentMeta.duration, saveLessonMeta],
  );

  // ---- Cronômetro de tempo assistido (pausa ao pausar/sair) ----
  const userId = session?.user?.id;
  const watch = useRef({ playing: false, watched: 0, pos: 0, lastT: 0, dirty: false });

  const flushProgress = useCallback(async () => {
    const w = watch.current;
    if (!userId || !w.dirty) return;
    w.dirty = false;
    await supabase.from("lesson_progress").upsert(
      {
        user_id: userId,
        course_slug: slug,
        lesson_n: currentLesson,
        watched_seconds: Math.round(w.watched),
        last_position: Math.round(w.pos),
        completed: completed.has(currentLesson),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,course_slug,lesson_n" },
    );
  }, [userId, slug, currentLesson, completed]);

  // Progresso real do aluno neste curso: quais aulas concluiu e onde parou.
  useEffect(() => {
    if (!userId) {
      setCompleted(new Set());
      setResumeAt({});
      return;
    }
    let alive = true;
    supabase
      .from("lesson_progress")
      .select("lesson_n, watched_seconds, last_position, completed")
      .eq("user_id", userId)
      .eq("course_slug", slug)
      .then(({ data }) => {
        if (!alive || !data) return;
        const done = new Set<number>();
        const pos: Record<number, number> = {};
        for (const r of data as {
          lesson_n: number;
          watched_seconds: number | null;
          last_position: number | null;
          completed: boolean | null;
        }[]) {
          if (r.completed) done.add(r.lesson_n);
          if (r.last_position && r.last_position > 5) pos[r.lesson_n] = r.last_position;
        }
        setCompleted(done);
        setResumeAt(pos);
      });
    return () => {
      alive = false;
    };
  }, [userId, slug]);

  // Ao trocar de aula: zera o acumulador e recupera o acumulado daquela aula.
  useEffect(() => {
    watch.current = { playing: false, watched: 0, pos: 0, lastT: 0, dirty: false };
    if (!userId) return;
    supabase
      .from("lesson_progress")
      .select("watched_seconds, last_position")
      .eq("user_id", userId)
      .eq("course_slug", slug)
      .eq("lesson_n", currentLesson)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          watch.current.watched = data.watched_seconds ?? 0;
          watch.current.pos = data.last_position ?? 0;
        }
      });
  }, [userId, slug, currentLesson]);

  // Salva tambem ao fechar a aba / trocar de app (mobile nem sempre desmonta).
  useEffect(() => {
    const save = () => flushProgress();
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, [flushProgress]);

  const onVideoPlayingChange = useCallback(
    (playing: boolean) => {
      watch.current.playing = playing;
      // Pausou: grava na hora onde parou, sem esperar o intervalo.
      if (!playing) {
        watch.current.dirty = true;
        void flushProgress();
      }
    },
    [flushProgress],
  );

  const onVideoTime = useCallback((t: number) => {
    const w = watch.current;
    if (w.playing) {
      const delta = t - w.lastT;
      if (delta > 0 && delta < 2) {
        w.watched += delta;
        w.dirty = true;
      }
    }
    w.lastT = t;
    w.pos = t;
  }, []);

  // Salva o progresso periodicamente e ao sair da aula/página.
  useEffect(() => {
    const iv = window.setInterval(() => flushProgress(), 6000);
    return () => {
      window.clearInterval(iv);
      flushProgress();
    };
  }, [flushProgress]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-3 pb-3 backdrop-blur-xl md:px-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 md:gap-4">
          {/* No PWA a barra de status cobre o topo — botao grande e afastado dela */}
          <Link
            to="/"
            aria-label="Voltar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-foreground transition active:scale-95 md:h-9 md:w-auto md:gap-2 md:rounded-lg md:border-0 md:bg-transparent md:px-0 md:text-sm md:text-muted-foreground md:hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
            <span className="hidden md:inline">Voltar</span>
          </Link>
          <div className="hidden h-6 w-px bg-border md:block" />
          <div className="hidden items-center gap-2 md:flex">
            <img src={lureLogo.url} alt="Lure" className="h-6 w-6 object-contain" />
            <span className="text-sm font-semibold tracking-wider">LURE Growth</span>
          </div>
          {/* No mobile o titulo do curso ocupa o centro */}
          <div className="min-w-0 flex-1 md:hidden">
            <div className="truncate text-[13px] font-semibold leading-tight">{courseTitle}</div>
            <div className="text-[11px] leading-tight text-muted-foreground">
              Aula {active.n} de {totalAulas}
            </div>
          </div>
        </div>
        <button
          onClick={openSettings}
          title="Editar perfil"
          className="flex shrink-0 items-center gap-3 rounded-full py-1 pl-3 pr-1 text-xs text-muted-foreground transition hover:bg-surface"
        >
          <span className="hidden md:inline">
            {profile?.full_name || profile?.email?.split("@")[0] || "Aluno LURE"} ·{" "}
            {isAdmin ? "Admin" : "Membro"}
          </span>
          <Avatar
            url={profile?.avatar_url}
            name={profile?.full_name}
            email={profile?.email}
            className="h-9 w-9"
            textClassName="text-[11px]"
          />
        </button>
      </header>

      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Player + info */}
        <main className="min-w-0">
          <VideoPlayer
            url={currentUrl}
            lessonN={active.n}
            startAt={resumeAt[active.n]}
            duration={displayDuration}
            isAdmin={isAdmin}
            onSave={saveVideo}
            onDuration={onVideoDuration}
            onPlayingChange={onVideoPlayingChange}
            onTime={onVideoTime}
          />

          {/* Lesson info */}
          <div className="border-b border-border px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <span className="h-1 w-5 rounded-full bg-primary" />
              {courseTitle}
            </div>
            <h1 className="mt-2 font-display text-[19px] font-bold leading-snug sm:text-2xl lg:text-3xl">
              <span className="mr-1.5 hidden text-muted-foreground sm:inline">Aula {active.n}:</span>
              <InlineTitle
                value={displayTitle}
                canEdit={isAdmin}
                onSave={(t) => saveLessonMeta({ title: t })}
                placeholder="Título da aula"
              />
            </h1>

            {/* Meta chips */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
                <Clock className="h-3.5 w-3.5" /> {displayDuration}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
                <Play className="h-3 w-3 fill-current" /> Aula {active.n} de {totalAulas}
              </span>
              {isCurrentDone && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 sm:text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Concluída
                </span>
              )}
            </div>

            <div className="mt-3.5 text-[13.5px] leading-relaxed sm:text-sm">
              <InlineText
                value={displayDesc}
                canEdit={isAdmin}
                onSave={(d) => saveLessonMeta({ description: d })}
                placeholder="Escreva a descrição desta aula…"
              />
            </div>

            {/* Ações principais */}
            <div className="mt-5 flex flex-row flex-wrap items-center gap-2.5">
              <button
                onClick={() => toggleComplete(active.n)}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-semibold transition sm:flex-none sm:text-sm ${
                  isCurrentDone
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                    : "border-border bg-surface hover:bg-muted"
                }`}
              >
                {isCurrentDone ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Concluída
                  </>
                ) : (
                  <>
                    <Circle className="h-4 w-4" /> Marcar como concluída
                  </>
                )}
              </button>
              {!isLast && (
                <button
                  onClick={goNext}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-3 text-[13px] font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110 sm:flex-none sm:text-sm"
                >
                  Próxima aula <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Materiais da aula */}
            <LessonMaterials slug={slug} lessonN={active.n} isAdmin={isAdmin} userId={session?.user?.id} />
          </div>

          {/* Conteúdo do curso — no mobile vem logo abaixo da aula */}
          <section className="border-b border-border px-4 py-5 sm:px-6 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" /> Conteúdo do curso
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {doneCount}/{totalAulas} concluídas
              </span>
            </div>

            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full gradient-gold transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            <LessonList
              lessons={lessons}
              currentLesson={currentLesson}
              setCurrentLesson={setCurrentLesson}
              completed={completed}
              videos={videos}
              isAdmin={isAdmin}
              onAdd={addLesson}
              onRemove={removeLesson}
              className="mt-3"
            />
          </section>

          {/* Comments */}
          <CommentsSection
            slug={slug}
            userId={session?.user?.id}
            authorName={profile?.full_name || profile?.email?.split("@")[0] || "Aluno"}
            isAdmin={isAdmin}
          />
        </main>

        {/* Lessons sidebar */}
        <aside className="hidden flex-col border-border bg-surface/40 lg:sticky lg:top-16 lg:flex lg:h-[calc(100vh-4rem)] lg:border-l">
          {/* Header do painel */}
          <div className="shrink-0 border-b border-border p-4 lg:p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" /> Conteúdo do curso
            </div>
            <h2 className="mt-2 font-display text-base font-bold leading-tight">{courseTitle}</h2>

            <div className="mt-3.5 flex items-center gap-3">
              {/* Anel de progresso */}
              <div className="relative grid h-11 w-11 shrink-0 place-items-center">
                <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-border"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="#BB9A35"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(progress / 100) * 97.4} 97.4`}
                    className="transition-all duration-500"
                  />
                </svg>
                <span className="absolute text-[11px] font-bold">{progress}%</span>
              </div>
              <div className="text-sm">
                <div className="font-semibold">
                  {doneCount} de {totalAulas} concluídas
                </div>
                <div className="text-xs text-muted-foreground">Continue de onde parou</div>
              </div>
            </div>
          </div>

          {/* Lista de aulas */}
          <LessonList
            lessons={lessons}
            currentLesson={currentLesson}
            setCurrentLesson={setCurrentLesson}
            completed={completed}
            videos={videos}
            isAdmin={isAdmin}
            onAdd={addLesson}
            onRemove={removeLesson}
            className="flex-1 overflow-y-auto p-2.5"
          />

          {/* Rodapé — suporte */}
          <div className="shrink-0 border-t border-border p-4">
            <a
              href="https://wa.me/5585991112424?text=Ol%C3%A1%2C%20estou%20assistindo%20uma%20aula%20e%20preciso%20de%20ajuda"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3 transition hover:border-primary/40"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <LifeBuoy className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">Precisa de ajuda?</div>
                <div className="text-xs text-muted-foreground">Fale com o suporte LURE</div>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------------- Lista de aulas (usada no painel e no mobile) ---------------- */

function LessonList({
  lessons,
  currentLesson,
  setCurrentLesson,
  completed,
  videos,
  isAdmin = false,
  onAdd,
  onRemove,
  className = "",
}: {
  lessons: Lesson[];
  currentLesson: number;
  setCurrentLesson: (n: number) => void;
  completed: Set<number>;
  videos: Record<number, LessonMeta>;
  isAdmin?: boolean;
  onAdd?: () => void;
  onRemove?: (n: number) => void;
  className?: string;
}) {
  /* O "+" entra antes da prova: ela fecha o curso e tem que continuar por
     último, mesmo depois de o admin criar aulas novas. */
  const botaoAdicionar = isAdmin && onAdd && (
    <li key="adicionar">
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-2.5 text-left text-muted-foreground transition hover:border-primary/50 hover:text-primary"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-background">
          <Plus className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold">Adicionar aula</span>
      </button>
    </li>
  );

  return (
          <ul className={`space-y-1 ${className}`}>
        {lessons.map((l) => {
          const isActive = l.n === currentLesson;
          const isProva = l.kind === "prova";
          const isDone = completed.has(l.n);
          const hasVideo = !!videos[l.n]?.url;
          // As cinco primeiras são do catálogo e não saem; as outras o admin criou.
          const podeRemover = isAdmin && !isProva && l.n > AULAS_FIXAS;
          return (
            <Fragment key={l.n}>
            {isProva && botaoAdicionar}
            <li className="relative">
              <button
                onClick={() => !l.locked && setCurrentLesson(l.n)}
                disabled={l.locked}
                className={`group relative flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                  isActive
                    ? "border-primary/40 bg-primary/10 shadow-[var(--shadow-glow)]"
                    : "border-transparent hover:border-border hover:bg-background"
                } ${l.locked ? "cursor-not-allowed opacity-60" : ""}`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                    isProva
                      ? "bg-primary/15 text-primary"
                      : isDone
                        ? "bg-emerald-500/15 text-emerald-400"
                        : isActive
                          ? "gradient-gold text-primary-foreground"
                          : "bg-background text-muted-foreground"
                  }`}
                >
                  {isProva ? (
                    <Award className="h-5 w-5" />
                  ) : l.locked ? (
                    <Lock className="h-4 w-4" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : isActive ? (
                    <Play className="h-4 w-4 fill-current" />
                  ) : (
                    l.n
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-sm font-semibold ${isActive ? "text-primary" : ""}`}
                  >
                    {videos[l.n]?.title ?? l.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    {isProva ? (
                      "Certificado de Conclusão"
                    ) : (
                      <>
                        <Clock className="h-3 w-3" /> {fmtDuration(videos[l.n]?.duration) ?? l.duration}
                        {hasVideo && <Youtube className="ml-1 h-3 w-3 text-red-500" />}
                      </>
                    )}
                  </div>
                </div>
              </button>

              {/* Irmão do botão da aula, não filho: botão dentro de botão não
                  vale, e o clique de remover subiria pra linha inteira. */}
              {podeRemover && (
                <button
                  type="button"
                  onClick={() => onRemove?.(l.n)}
                  title={`Remover aula ${l.n}`}
                  aria-label={`Remover aula ${l.n}`}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
            </Fragment>
          );
        })}
      </ul>
  );
}

/* ---------------- Player ---------------- */

function VideoPlayer({
  url,
  lessonN,
  startAt,
  duration,
  isAdmin,
  onSave,
  onDuration,
  onPlayingChange,
  onTime,
}: {
  url?: string;
  lessonN: number;
  /** Segundo em que o aluno parou nessa aula. */
  startAt?: number;
  duration: string;
  isAdmin: boolean;
  onSave: (url: string) => Promise<void>;
  onDuration?: (s: number) => void;
  onPlayingChange?: (p: boolean) => void;
  onTime?: (s: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(url ?? "");
    setEditing(false);
    setError(null);
  }, [url, lessonN]);

  const embed = url ? toYouTubeEmbed(url) : null;

  const handleSave = async () => {
    setError(null);
    if (value.trim() && !toYouTubeEmbed(value)) {
      setError("Link do YouTube inválido. Cole a URL completa do vídeo.");
      return;
    }
    setSaving(true);
    await onSave(value.trim());
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="flex w-full justify-center bg-black">
      <div className="relative aspect-video max-h-[calc(100vh-4rem)] w-full max-w-[calc((100vh-4rem)*16/9)] overflow-hidden">
        {embed && !editing ? (
          <LurePlayer
            videoUrl={url!}
            startAt={startAt}
            className="absolute inset-0 h-full w-full"
            onDuration={onDuration}
            onPlayingChange={onPlayingChange}
            onTime={onTime}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center">
            {editing ? (
              <div className="w-full max-w-md rounded-2xl border border-border bg-surface/95 p-5 text-left shadow-2xl backdrop-blur">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Youtube className="h-4 w-4 text-red-500" /> Link do YouTube — Aula {lessonN}
                </div>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setEditing(false);
                      setValue(url ?? "");
                      setError(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg gradient-gold px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-70"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {isDemoMode ? (
                  // Aula de teste do modo demo: fundo preto com o símbolo da LURE.
                  <img src={lureLogo.url} alt="LURE" className="h-20 w-20 object-contain opacity-90" />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-full border border-white/15 bg-white/5">
                    <Youtube className="h-7 w-7 text-white/60" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-white/90">Vídeo em breve</p>
                  <p className="mt-1 text-xs text-white/50">
                    Aula {lessonN} · {duration}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setEditing(true)}
                    className="mt-1 inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20"
                  >
                    <Youtube className="h-4 w-4" /> Adicionar link do YouTube
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Badge + editar (admin) sobre o vídeo */}
        {embed && !editing && (
          <>
            <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
              Aula {lessonN} · {duration}
            </div>
            {isAdmin && (
              <button
                onClick={() => setEditing(true)}
                className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur transition hover:bg-black/80"
              >
                <Pencil className="h-3.5 w-3.5" /> Trocar vídeo
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Materiais da aula ---------------- */

type Material = { id: string; label: string; url: string };

function LessonMaterials({
  slug,
  lessonN,
  isAdmin,
  userId,
}: {
  slug: string;
  lessonN: number;
  isAdmin: boolean;
  userId?: string;
}) {
  const [items, setItems] = useState<Material[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("lesson_materials")
      .select("id, label, url")
      .eq("course_slug", slug)
      .eq("lesson_n", lessonN)
      .order("created_at", { ascending: true });
    setItems((data as Material[]) ?? []);
  }, [slug, lessonN]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (f: File | null) => {
    if (!f) return;
    const invalid = validateMaterialFile(f);
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    try {
      const url = await uploadMaterial(f, slug, lessonN);
      const { error: insErr } = await supabase.from("lesson_materials").insert({
        course_slug: slug,
        lesson_n: lessonN,
        label: f.name,
        url,
        created_by: userId ?? null,
      });
      if (insErr) throw insErr;
      await load();
    } catch (e: unknown) {
      setError(`Não subiu: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remover este material?")) return;
    await supabase.from("lesson_materials").delete().eq("id", id);
    load();
  };

  // Sem materiais e sem ser admin: não mostra nada.
  if (items.length === 0 && !isAdmin) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <FileText className="h-3.5 w-3.5" /> Materiais da aula
      </div>

      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2">
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                <Download className="h-4 w-4 text-primary" />
                <span className="truncate">{it.label}</span>
              </a>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  className="shrink-0 rounded-lg border border-red-500/30 px-2.5 py-2 text-red-400 transition hover:bg-red-500/10"
                  title="Remover material"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum material ainda.</p>
      )}

      {isAdmin && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {busy ? "Enviando…" : "Adicionar material"}
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => add(e.target.files?.[0] ?? null)}
          />
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            PDF, planilha, zip… até 50 MB. O aluno baixa clicando no material.
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------------- Comentários ---------------- */

function CommentsSection({
  slug,
  userId,
  authorName,
  isAdmin,
}: {
  slug: string;
  userId?: string;
  authorName: string;
  isAdmin: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("comments")
      .select("id, body, author_name, user_id, created_at")
      .eq("course_slug", slug)
      .order("created_at", { ascending: false });
    setComments((data as Comment[]) ?? []);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !userId) return;
    setPosting(true);
    const { error } = await supabase.from("comments").insert({
      course_slug: slug,
      user_id: userId,
      author_name: authorName,
      body,
    });
    setPosting(false);
    if (!error) {
      setText("");
      load();
    }
  };

  const remove = async (id: string) => {
    await supabase.from("comments").delete().eq("id", id);
    load();
  };

  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8">
      <h2 className="font-display text-lg font-bold">
        Comentários {loading ? "" : `(${comments.length})`}
      </h2>

      <form onSubmit={submit} className="mt-6 rounded-xl border border-border bg-surface p-5">
        <label className="mb-3 block text-sm font-semibold">Deixe sua dúvida ou feedback:</label>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva seu comentário aqui..."
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="inline-flex items-center gap-2 rounded-lg gradient-gold px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {posting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Enviar
          </button>
        </div>
      </form>

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando comentários…
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/50 py-10 text-center">
            <MessageCircle className="mx-auto h-6 w-6 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              Ainda não há comentários. Seja o primeiro!
            </p>
          </div>
        ) : (
          comments.map((c) => {
            const canDelete = isAdmin || c.user_id === userId;
            return (
              <div key={c.id} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full gradient-gold text-xs font-bold text-primary-foreground">
                  {initialsOf(c.author_name)}
                </div>
                <div className="flex-1 rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-primary">{c.author_name}</div>
                    {canDelete && (
                      <button
                        onClick={() => remove(c.id)}
                        className="text-muted-foreground transition hover:text-red-400"
                        title="Apagar comentário"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {c.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, CheckCircle2, Award, Download, Sparkles } from "lucide-react";
import {
  Sidebar,
  TopBar,
  MobileTopBar,
  MobileTabBar,
  MobileModuleCard,
  sections,
  moduleSlug,
  useLoadCourseProgress,
  useLessonTotals,
  moduleKey,
  type Module,
} from "./index";
import { AULAS_FIXAS } from "@/lib/aulas";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import lureLogo from "@/assets/lure-logo-large.png.asset.json";

const coverKey = (sectionId: string, title: string) => `${sectionId}|${title.trim()}`;

export const Route = createFileRoute("/meus-cursos")({
  head: () => ({
    meta: [
      { title: "Meus cursos — LURE Growth" },
      { name: "description", content: "Seu dashboard de cursos: veja o progresso e baixe seus certificados." },
      { property: "og:title", content: "Meus cursos — LURE Growth" },
      { property: "og:description", content: "Sua jornada de aprendizado na LURE." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab as TabKey) ?? "andamento",
  }),
  component: MeusCursosPage,
});

type EnrichedModule = Module & { sectionId: string; sectionTitle: string };
type TabKey = "andamento" | "concluidos" | "certificados";

function MeusCursosPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { session } = useAuth();
  // Progresso real do aluno (aulas concluidas no banco), nunca dado de demo.
  // O total vem de `lesson_videos`, o mesmo divisor que a home usa.
  const lessonTotals = useLessonTotals();
  const courseProgress = useLoadCourseProgress(session?.user?.id, lessonTotals);
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setTab = (t: TabKey) => navigate({ search: { tab: t } });

  // Capa e autor reais salvos no painel (banco), mesmo esquema da Home. Sem o
  // filtro de capa: o autor tambem vale pra modulo que ainda nao tem imagem.
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [authors, setAuthors] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    supabase
      .from("modules")
      .select("section_id, title, author, cover_url")
      .then(({ data }) => {
        if (!alive || !data) return;
        const capas: Record<string, string> = {};
        const nomes: Record<string, string> = {};
        for (const row of data as {
          section_id: string;
          title: string;
          author: string | null;
          cover_url: string | null;
        }[]) {
          const chave = coverKey(row.section_id, row.title);
          if (row.cover_url) capas[chave] = row.cover_url;
          if (row.author?.trim()) nomes[chave] = row.author.trim();
        }
        setCovers(capas);
        setAuthors(nomes);
      });
    return () => {
      alive = false;
    };
  }, []);

  const all: EnrichedModule[] = useMemo(
    () =>
      sections.flatMap((s) =>
        s.modules.map((m) => ({
          ...m,
          progress: courseProgress[moduleSlug(m.title)] ?? 0,
          sectionId: s.id,
          sectionTitle: s.title,
        })),
      ),
    [courseProgress],
  );

  const inProgress = all.filter((m) => m.progress > 0 && m.progress < 100);
  const completed = all.filter((m) => m.progress >= 100);
  const visible = tab === "andamento" ? inProgress : completed;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} current="/meus-cursos" />
        <div className="flex-1 min-w-0">
          <MobileTopBar />
          <div className="hidden lg:block">
            <TopBar />
          </div>

          <main className="pb-32 lg:pb-24">
            <div className="mx-auto max-w-[1400px] px-4 md:px-10 pt-8 lg:pt-10">
              <header>
                <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
                  Meus cursos
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Seu dashboard — veja o progresso e baixe seus certificados.
                </p>
              </header>

              {/* Tabs */}
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <TabChip active={tab === "andamento"} onClick={() => setTab("andamento")}>
                  Em andamento <Count n={inProgress.length} />
                </TabChip>
                <TabChip active={tab === "concluidos"} onClick={() => setTab("concluidos")}>
                  Concluídos <Count n={completed.length} />
                </TabChip>
                <TabChip active={tab === "certificados"} onClick={() => setTab("certificados")}>
                  <Award className="mr-1 h-3.5 w-3.5" />
                  Certificados <Count n={completed.length} />
                </TabChip>
              </div>

              {/* Grid */}
              <section className="mt-8">
                {visible.length === 0 ? (
                  <EmptyState tab={tab} />
                ) : (
                  <>
                    {/* Mobile: grade de dois cards, igual a home */}
                    <div className="grid grid-cols-2 gap-3.5 lg:hidden">
                      {visible.map((m) =>
                        tab === "certificados" ? (
                          <CertificateCard
                            key={m.title}
                            m={m}
                            autor={authors[moduleKey(m.sectionId, m)] ?? m.author}
                            totalAulas={lessonTotals[moduleSlug(m.title)] ?? AULAS_FIXAS}
                          />
                        ) : (
                          <MobileModuleCard key={m.title} m={m} sectionId={m.sectionId} />
                        ),
                      )}
                    </div>

                    {/* Desktop */}
                    <div className="hidden gap-5 lg:grid lg:grid-cols-3 xl:grid-cols-4">
                      {visible.map((m) =>
                        tab === "certificados" ? (
                          <CertificateCard
                            key={m.title}
                            m={m}
                            autor={authors[moduleKey(m.sectionId, m)] ?? m.author}
                            totalAulas={lessonTotals[moduleSlug(m.title)] ?? AULAS_FIXAS}
                          />
                        ) : (
                          <CourseCard
                            key={m.title}
                            m={m}
                            covers={covers}
                            autor={authors[moduleKey(m.sectionId, m)] ?? m.author}
                            totalAulas={lessonTotals[moduleSlug(m.title)] ?? AULAS_FIXAS}
                          />
                        ),
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>
          </main>

          <MobileTabBar current="/meus-cursos" />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Cards ---------------- */

function CourseCard({
  m,
  covers,
  autor,
  totalAulas,
}: {
  m: EnrichedModule;
  covers: Record<string, string>;
  autor: string;
  totalAulas: number;
}) {
  const done = m.progress >= 100;
  // Capa real do banco > thumb do código. Sem nenhuma das duas, cai no
  // fundo preto com a logo (igual aos cards da home).
  const cover = covers[moduleKey(m.sectionId, m)] ?? m.thumb;
  return (
    <Link
      to="/curso/$slug"
      params={{ slug: slugify(m.title) }}
      className="group relative flex h-[440px] flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-1 hover:border-[var(--nav)]/50 hover:shadow-[var(--shadow-card)]"
    >
      {/* Banner cobrindo o card inteiro, igual aos cards da home */}
      {cover ? (
        <img
          src={cover}
          alt={m.title}
          loading="lazy"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      ) : (
        <>
          <div className="pointer-events-none absolute inset-0 bg-black" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <img
              src={lureLogo.url}
              alt="LURE"
              className="h-20 w-20 object-contain opacity-90 transition duration-500 group-hover:scale-105"
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(ellipse_70%_90%_at_50%_100%,rgba(187,154,53,0.28),transparent_70%)]" />
        </>
      )}

      {/* Hover play */}
      <div className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/70 opacity-0 backdrop-blur transition group-hover:opacity-100">
        <Play className="h-4 w-4 fill-[var(--nav)] text-[var(--nav)]" />
      </div>

      {/* Header */}
      <div className="relative flex flex-1 flex-col p-6">
        <span
          className={`mb-4 inline-flex w-fit items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur ${
            done ? "bg-emerald-500/90 text-white" : "bg-background/70 text-foreground"
          }`}
        >
          {done ? (
            <>
              <CheckCircle2 className="h-3 w-3" /> Concluído
            </>
          ) : (
            `${m.progress}% concluído`
          )}
        </span>
        {/* A capa ja traz o titulo escrito; so mostramos texto quando nao ha capa. */}
        {!cover && (
          <h3 className="font-display text-xl font-bold leading-snug drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            {m.title}
          </h3>
        )}

        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
          <span className="truncate">{autor}</span>
          <span className="flex shrink-0 items-center gap-1">
            <Play className="h-3 w-3" /> {totalAulas} {totalAulas === 1 ? "aula" : "aulas"}
          </span>
        </div>
      </div>

      {/* Barra de progresso colada na base */}
      <div className="relative h-1.5 w-full bg-background/70">
        <div
          className={`h-full ${done ? "bg-emerald-400" : "bg-[var(--nav)]"}`}
          style={{ width: `${m.progress}%` }}
        />
      </div>
    </Link>
  );
}

function CertificateCard({
  m,
  autor,
  totalAulas,
}: {
  m: EnrichedModule;
  autor: string;
  totalAulas: number;
}) {
  const download = () =>
    downloadCertificate({
      student: "Alvaro Paiva",
      course: m.title,
      section: m.sectionTitle,
      author: autor,
      // O certificado imprime quantas aulas o aluno fez — tem que ser o numero
      // de verdade, nao o do catalogo.
      lessons: totalAulas,
    });

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 90% 60% at 50% 100%, rgba(187, 154, 53, 0.35), transparent 65%)",
          }}
        />
        <div className="absolute inset-3 rounded-xl border border-primary/40" />
        <div className="absolute inset-5 rounded-lg border border-primary/20" />
        <div className="relative flex h-full flex-col items-center justify-center p-5 text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.32em] text-primary">
            LURE Growth
          </div>
          <div
            className="mt-1.5 text-2xl italic leading-tight text-white"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            Certificado
          </div>
          <div className="mt-2 line-clamp-2 max-w-[85%] text-xs text-white/80">{m.title}</div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.24em] text-white/60">
            <Sparkles className="h-2.5 w-2.5" /> Alvaro Paiva
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {m.sectionTitle}
          </div>
          <div className="mt-1 truncate font-display text-sm font-bold">{m.title}</div>
        </div>
        <button
          onClick={download}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/25"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar
        </button>
      </div>
    </div>
  );
}

/* ---------------- Bits ---------------- */

function TabChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-foreground text-background"
          : "border border-border bg-surface text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="ml-1.5 rounded-full bg-black/10 px-1.5 text-[10px] opacity-70">{n}</span>;
}

function EmptyState({ tab }: { tab: TabKey }) {
  const copy =
    tab === "concluidos" || tab === "certificados"
      ? {
          title: "Nenhum curso concluído ainda",
          desc: "Finalize um curso para desbloquear seu certificado.",
        }
      : {
          title: "Você ainda não começou nenhum curso",
          desc: "Explore o catálogo e comece sua jornada.",
        };
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface text-muted-foreground">
        <BookOpenIcon />
      </div>
      <p className="text-sm font-semibold">{copy.title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{copy.desc}</p>
      <Link
        to="/"
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/25"
      >
        Explorar catálogo
      </Link>
    </div>
  );
}

function BookOpenIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

/* ---------------- Helpers ---------------- */

function slugify(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function downloadCertificate(opts: {
  student: string;
  course: string;
  section: string;
  author: string;
  lessons: number;
}) {
  const w = 1600;
  const h = 1100;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#0A0A0A");
  bg.addColorStop(0.5, "#141414");
  bg.addColorStop(1, "#0A0A0A");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w / 2, h, 100, w / 2, h, 900);
  glow.addColorStop(0, "rgba(187, 154, 53, 0.35)");
  glow.addColorStop(1, "rgba(187, 154, 53, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(187, 154, 53, 0.9)";
  ctx.lineWidth = 4;
  ctx.strokeRect(60, 60, w - 120, h - 120);
  ctx.strokeStyle = "rgba(187, 154, 53, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(90, 90, w - 180, h - 180);

  ctx.textAlign = "center";
  ctx.fillStyle = "#BB9A35";
  ctx.font = "bold 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("LURE  GROWTH   ·   ÁREA DE MEMBROS", w / 2, 220);

  ctx.fillStyle = "#ffffff";
  ctx.font = 'italic 96px "Cormorant Garamond", Georgia, serif';
  ctx.fillText("Certificado de Conclusão", w / 2, 350);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Concedido a", w / 2, 430);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 72px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(opts.student, w / 2, 520);

  ctx.strokeStyle = "rgba(187, 154, 53, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 220, 560);
  ctx.lineTo(w / 2 + 220, 560);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("por concluir com êxito o curso", w / 2, 620);

  ctx.fillStyle = "#BB9A35";
  ctx.font = "bold 52px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(opts.course, w / 2, 700);

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(
    `${opts.section}  ·  Mentor: ${opts.author}  ·  ${opts.lessons} aulas`,
    w / 2,
    750,
  );

  const dateStr = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(300, 920);
  ctx.lineTo(600, 920);
  ctx.moveTo(w - 600, 920);
  ctx.lineTo(w - 300, 920);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Lure Digital", 450, 960);
  ctx.fillText(dateStr, w - 450, 960);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Assinatura", 450, 985);
  ctx.fillText("Data de emissão", w - 450, 985);

  const code =
    "LURE-" +
    Math.random().toString(36).slice(2, 7).toUpperCase() +
    "-" +
    Math.random().toString(36).slice(2, 7).toUpperCase();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`Código de verificação: ${code}`, w / 2, h - 110);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certificado-${slugify(opts.course)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, "image/png");
}

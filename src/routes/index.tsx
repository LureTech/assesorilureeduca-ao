import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { isDemoMode, supabase } from "@/lib/supabase";
import {
  Play,
  Search,
  Bell,
  ChevronRight,
  ChevronLeft,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  User,
  CreditCard,
  LogOut,
  Crown,
  ShieldCheck,
  Menu,
  ArrowRight,
  X,
  Lock,
  LockOpen,
} from "lucide-react";
import {
  BookOpenText,
  Certificate,
  GearSix,
  Headset,
  HouseSimple,
  ShieldStar,
  SignOut,
  UsersThree,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth";
import { AULAS_FIXAS, totalDeAulas } from "@/lib/aulas";
import { Avatar, initialsOf } from "@/components/avatar";
import { openSettings } from "@/components/profile-settings-modal";
import lureLogo from "@/assets/lure-logo-large.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LURE Growth — Área de Membros" },
      { name: "description", content: "Plataforma oficial de cursos e trilhas da Lure Digital." },
      { property: "og:title", content: "LURE Growth — Área de Membros" },
      { property: "og:description", content: "Trilhas de crescimento, IA e performance." },
    ],
  }),
  component: Portal,
});

export type Module = {
  title: string;
  author: string;
  lessons: number;
  progress: number;
  tag?: string;
  accent?: "gold" | "blue" | "green" | "none";
  thumb?: string;
  /** Se presente, o card abre a página de módulo do banco (aulas + vídeos editáveis). */
  moduleId?: string;
  /**
   * Título da linha em `modules` quando ele não é o mesmo daqui.
   *
   * O card acha a sua linha no banco por seção+título. Alguns módulos foram
   * renomeados no painel e o catálogo ficou com o nome antigo — sem isso eles
   * não se encontram, e ficam sem capa, sem autor e sem cadeado editáveis.
   * Apontar a linha resolve sem renomear curso nem mudar URL.
   */
  dbTitle?: string;
};

/** Chave do módulo no banco: `dbTitle` manda, o título daqui é o padrão. */
export const moduleKey = (sectionId: string, m: Pick<Module, "title" | "dbTitle">) =>
  coverKey(sectionId, m.dbTitle ?? m.title);

/**
 * Modo demo (sem banco): quatro aulas de teste por seção, pra home não ficar
 * vazia. Sem capa de propósito — o card cai no fundo preto com o símbolo da
 * LURE. Fora do demo devolve lista vazia e o catálogo fica como está.
 *
 * Entra como valor no próprio catálogo, e não com `push` depois: código solto
 * no topo do arquivo pode rodar mais de uma vez, e aí as aulas dobravam.
 */
const aulasTeste = (secao: number): Module[] =>
  isDemoMode
    ? [1, 2, 3, 4].map((j) => ({
        title: `Aula Teste ${secao * 4 + j}`,
        author: "Time LURE",
        lessons: AULAS_FIXAS,
        progress: 0,
      }))
    : [];

/**
 * Catálogo da home. As seções já estão aqui; os módulos entram em cada uma
 * conforme os cursos forem gravados. Seção sem módulo não aparece na página.
 */
export const sections: { id: string; title: string; subtitle: string; modules: Module[] }[] = [
  {
    id: "intro",
    title: "INTRODUÇÃO",
    subtitle: "Comece por aqui — a base do ecossistema LURE",
    modules: aulasTeste(0),
  },
  {
    id: "social",
    title: "SOCIAL SELLING",
    subtitle: "Prospecção e autoridade nas redes",
    modules: aulasTeste(1),
  },
  {
    id: "call",
    title: "CALL DE VENDAS",
    subtitle: "Do primeiro contato ao fechamento",
    modules: aulasTeste(2),
  },
  {
    id: "rh",
    title: "RH & CULTURA",
    subtitle: "Time forte, cultura forte, resultado forte",
    modules: aulasTeste(3),
  },
  {
    id: "comercial",
    title: "COMERCIAL",
    subtitle: "Processos, funil e conversão de alto ticket",
    modules: aulasTeste(4),
  },
  {
    id: "marketing",
    title: "MARKETING",
    subtitle: "Estratégia, marca e posicionamento",
    modules: aulasTeste(5),
  },
  {
    id: "trafego",
    title: "GESTÃO DE TRÁFEGO",
    subtitle: "Meta, Google e mensuração em escala",
    modules: aulasTeste(6),
  },
  {
    id: "ia",
    title: "IA APLICADA",
    subtitle: "Inteligência artificial no dia a dia de marketing",
    modules: aulasTeste(7),
  },
  {
    id: "conteudo",
    title: "CONTEÚDO & CRIATIVOS",
    subtitle: "Narrativa, roteiro e produção que converte",
    modules: aulasTeste(8),
  },
];

/**
 * Capas vindas do banco (painel admin), indexadas por `${section_id}|${title}`.
 * Quando existe uma capa salva no painel, ela substitui a imagem fixa do código.
 */
const CoversContext = createContext<Record<string, string>>({});
const coverKey = (sectionId: string, title: string) => `${sectionId}|${title.trim()}`;

/**
 * Autor/mentor de cada módulo, do banco, na mesma chave das capas.
 *
 * O `author` do catálogo é do protótipo e envelheceu junto com o resto: nos
 * módulos de Social Selling o código ainda diz "Julia Farias" e o banco já
 * está em "Julia Lemos". Quem manda é o banco — que é o que o painel
 * `/admin/modulos` edita no campo "Autor / mentor".
 */
const AuthorsContext = createContext<Record<string, string>>({});

/**
 * Cadeado do card, indexado pela mesma chave das capas.
 *
 * `modules.locked` diz se o módulo ainda não está no ar. Para o aluno o card
 * não abre; para o admin o cadeado vira botão e destrava na hora, para todo
 * mundo. Guardamos o `id` junto porque o catálogo da home é estático e só o
 * par seção+título liga o card à linha do banco.
 */
type LockInfo = { id: string; locked: boolean };
const LocksContext = createContext<{
  byKey: Record<string, LockInfo>;
  /**
   * Falso até a consulta voltar. Sem isso o catálogo pinta antes de saber
   * quem está trancado, e o aluno vê os módulos fechados por um instante
   * antes de eles sumirem.
   */
  carregado: boolean;
  setLocked: (key: string, id: string, locked: boolean) => void;
}>({ byKey: {}, carregado: false, setLocked: () => {} });

function useModuleLock(chave: string) {
  const { byKey, setLocked } = useContext(LocksContext);
  const info = byKey[chave];
  return {
    locked: info?.locked ?? false,
    /** Sem linha no banco não há o que gravar — some o botão em vez de dar erro. */
    podeTrancar: !!info,
    alternar: () => {
      if (info) setLocked(chave, info.id, !info.locked);
    },
  };
}

/** Titulo do modulo -> slug usado na URL do curso e no banco. */
export const moduleSlug = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Progresso real do aluno: % por curso, calculado sobre as aulas concluidas
 * salvas em lesson_progress. Sem dados = 0%.
 */
const ProgressContext = createContext<Record<string, number>>({});

export function useCourseProgress() {
  return useContext(ProgressContext);
}

/**
 * Quantas aulas cada curso tem de verdade, vindo de `lesson_videos`.
 *
 * O `lessons` do catalogo e um numero escrito a mao la no prototipo e nunca
 * soube das aulas que o admin adicionou depois — por isso nao serve nem pro
 * card nem pra conta do progresso.
 */
const TotalsContext = createContext<Record<string, number>>({});

export function useLessonTotals() {
  const [totais, setTotais] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    supabase
      .from("lesson_videos")
      .select("course_slug, lesson_n")
      .then(({ data }) => {
        if (!alive || !data) return;
        const porCurso: Record<string, number[]> = {};
        for (const r of data as { course_slug: string; lesson_n: number }[]) {
          (porCurso[r.course_slug] ??= []).push(r.lesson_n);
        }
        setTotais(
          Object.fromEntries(Object.entries(porCurso).map(([slug, ns]) => [slug, totalDeAulas(ns)])),
        );
      });
    return () => {
      alive = false;
    };
  }, []);
  return totais;
}

/** Curso sem nenhuma linha no banco ainda mostra as cinco fixas na pagina. */
export function useCourseLessonCount(slug: string) {
  return useContext(TotalsContext)[slug] ?? AULAS_FIXAS;
}

export function useLoadCourseProgress(userId?: string, totals: Record<string, number> = {}) {
  const [map, setMap] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!userId) {
      setMap({});
      return;
    }
    let alive = true;
    supabase
      .from("lesson_progress")
      .select("course_slug, lesson_n, completed")
      .eq("user_id", userId)
      .eq("completed", true)
      .then(({ data }) => {
        if (!alive || !data) return;
        const done: Record<string, Set<number>> = {};
        for (const r of data as { course_slug: string; lesson_n: number }[]) {
          (done[r.course_slug] ??= new Set()).add(r.lesson_n);
        }
        const pct: Record<string, number> = {};
        for (const [slug, set] of Object.entries(done)) {
          // Mesmo divisor que o card mostra. Antes vinha do catalogo: quem
          // terminava as 15 do Anderson dividia por 6 e estourava a barra.
          const total = totals[slug] ?? AULAS_FIXAS;
          if (total) pct[slug] = Math.min(100, Math.round((set.size / total) * 100));
        }
        setMap(pct);
      });
    return () => {
      alive = false;
    };
  }, [userId, totals]);
  return map;
}

function Portal() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [locks, setLocks] = useState<Record<string, LockInfo>>({});
  const [locksCarregados, setLocksCarregados] = useState(false);
  const { session } = useAuth();
  const lessonTotals = useLessonTotals();
  const courseProgress = useLoadCourseProgress(session?.user?.id, lessonTotals);

  useEffect(() => {
    let alive = true;
    // Sem filtro de capa: justamente os módulos trancados são os que não têm
    // capa nenhuma, e é deles que precisamos saber o estado do cadeado.
    supabase
      .from("modules")
      .select("id, section_id, title, author, cover_url, locked")
      .then(({ data }) => {
        if (!alive || !data) return;
        const capas: Record<string, string> = {};
        const nomes: Record<string, string> = {};
        const cadeados: Record<string, LockInfo> = {};
        for (const row of data as {
          id: string;
          section_id: string;
          title: string;
          author: string | null;
          cover_url: string | null;
          locked: boolean | null;
        }[]) {
          const chave = coverKey(row.section_id, row.title);
          if (row.cover_url) capas[chave] = row.cover_url;
          if (row.author?.trim()) nomes[chave] = row.author.trim();
          cadeados[chave] = { id: row.id, locked: !!row.locked };
        }
        setCovers(capas);
        setAuthors(nomes);
        setLocks(cadeados);
        setLocksCarregados(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Destrava na tela primeiro e grava depois: o admin vê o efeito no clique.
  // Se o banco recusar (RLS, rede), o cadeado volta pro lugar.
  const setLocked = useCallback(async (key: string, id: string, locked: boolean) => {
    setLocks((prev) => ({ ...prev, [key]: { id, locked } }));
    const { error } = await supabase.from("modules").update({ locked }).eq("id", id);
    if (error) setLocks((prev) => ({ ...prev, [key]: { id, locked: !locked } }));
  }, []);

  const lockCtx = useMemo(
    () => ({ byKey: locks, carregado: locksCarregados, setLocked }),
    [locks, locksCarregados, setLocked],
  );

  return (
    <CoversContext.Provider value={covers}>
      <AuthorsContext.Provider value={authors}>
      <LocksContext.Provider value={lockCtx}>
      <TotalsContext.Provider value={lessonTotals}>
      <ProgressContext.Provider value={courseProgress}>
        <div className="min-h-screen bg-background text-foreground">
          <div className="flex">
            <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />
            <div className="flex-1 min-w-0">
              {/* Mobile-only top bar */}
              <MobileTopBar />
              {/* Desktop top bar */}
              <div className="hidden lg:block">
                <TopBar />
              </div>
              <main className="pb-32 lg:pb-24">
                {/* Mobile-only G4-style hero */}
                <div className="lg:hidden">
                  <MobileHero />
                </div>
                {/* Desktop hero */}
                <div className="hidden lg:block">
                  <HeroBanner />
                </div>
                <div className="mx-auto max-w-[1400px] px-4 md:px-10">
                  {/* Catálogo único da home (com as fotos das calls de vendas) */}
                  {sections.map((s) => (
                    <SectionRow key={s.id} section={s} />
                  ))}
                </div>
              </main>
              {/* Mobile bottom tab bar */}
              <MobileTabBar />
            </div>
          </div>
        </div>
      </ProgressContext.Provider>
      </TotalsContext.Provider>
      </LocksContext.Provider>
      </AuthorsContext.Provider>
    </CoversContext.Provider>
  );
}

export function MobileTopBar() {
  const { profile, session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Mesmo motivo da barra do desktop: fixa no topo + blur = reborrar a cada
          quadro de rolagem. */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between bg-background px-4 pb-3 lg:hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
          className="grid h-10 w-10 place-items-center rounded-xl text-foreground transition active:scale-95"
        >
          <Menu className="h-6 w-6" strokeWidth={1.8} />
        </button>

        <Link to="/" className="flex items-center gap-2">
          <img src={lureLogo.url} alt="LURE" className="h-7 w-7 object-contain" />
          <span className="font-display text-[17px] leading-none tracking-tight">
            <span className="font-normal">Lure</span> <span className="font-bold">Growth</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            aria-label="Notificações"
            className="relative grid h-10 w-10 place-items-center rounded-xl text-foreground transition active:scale-95"
          >
            <Bell className="h-[22px] w-[22px]" strokeWidth={1.7} />
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--nav)] ring-2 ring-background" />
          </button>
          <button
            onClick={openSettings}
            aria-label="Editar perfil"
            className="relative h-10 w-10 shrink-0 rounded-full ring-2 ring-white/15 transition active:scale-95"
          >
            <Avatar
              url={profile?.avatar_url}
              name={profile?.full_name}
              email={profile?.email || session?.user?.email}
              className="h-10 w-10"
              textClassName="text-[12px]"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background" />
          </button>
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

/** Gaveta lateral do mobile — abre no botão de menu da barra de topo. */
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, session, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Trava o scroll do fundo enquanto a gaveta está aberta.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const links = [
    { icon: HouseSimple, label: "Início", to: "/" },
    { icon: BookOpenText, label: "Meus cursos", to: "/meus-cursos" },
    { icon: UsersThree, label: "Comunidade", to: "/comunidade" },
    { icon: Certificate, label: "Certificados", to: "/meus-cursos" },
  ] as const;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onClose();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className={`lg:hidden ${open ? "" : "pointer-events-none"}`}>
      {/* Fundo escuro */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Painel */}
      <aside
        className={`dark-scope fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-[320px] flex-col border-r border-border/60 bg-gradient-to-b from-surface to-background shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
      >
        <div className="flex items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <img src={lureLogo.url} alt="LURE" className="h-9 w-9 object-contain" />
            <span className="font-display text-[17px] leading-none tracking-tight">
              <span className="font-normal">Lure</span> <span className="font-bold">Growth</span>
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Perfil */}
        <button
          onClick={() => {
            onClose();
            openSettings();
          }}
          className="mx-4 mt-6 flex items-center gap-3 rounded-2xl border border-border/60 bg-surface-elevated/60 p-3 text-left transition active:scale-[0.99]"
        >
          <Avatar
            url={profile?.avatar_url}
            name={profile?.full_name}
            email={profile?.email || session?.user?.email}
            className="h-11 w-11"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {profile?.full_name || "Aluno LURE"}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {isAdmin ? "Administrador" : "Membro"}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {/* Navegação */}
        <nav className="mt-6 flex flex-col gap-1 px-3">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              onClick={onClose}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-foreground/90 transition active:bg-muted/60"
            >
              <l.icon className="h-5 w-5 text-muted-foreground" weight="regular" />
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="mx-3 my-4 h-px bg-border/50" />

        <div className="flex flex-col gap-1 px-3">
          <a
            href="https://wa.me/5585991112424?text=Ol%C3%A1%2C%20estou%20na%20%C3%81rea%20de%20Membros%20e%20preciso%20de%20ajuda"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-foreground/90 transition active:bg-muted/60"
          >
            <Headset className="h-5 w-5 text-muted-foreground" /> Suporte
          </a>
          <button
            onClick={() => {
              onClose();
              openSettings();
            }}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-foreground/90 transition active:bg-muted/60"
          >
            <GearSix className="h-5 w-5 text-muted-foreground" /> Configurações
          </button>
          {isAdmin && (
            <Link
              to="/admin"
              onClick={onClose}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-foreground/90 transition active:bg-muted/60"
            >
              <ShieldStar className="h-5 w-5 text-muted-foreground" />{" "}
              Administração
            </Link>
          )}
        </div>

        <div
          className="mt-auto px-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-red-400 transition active:bg-red-500/10"
          >
            <SignOut className="h-5 w-5" /> Sair
          </button>
        </div>
      </aside>
    </div>
  );
}

/** Banner do mobile: um unico destaque fixo com o video de boas-vindas. */
const MOBILE_HERO = {
  eyebrow: "Bem-vindo ao",
  title: "LURE Growth",
  lines: [
    "A plataforma oficial da agência que já rodou +R$100M em mídia.",
    "Trilhas guiadas, mentorias ao vivo e a comunidade que cresce junto com você.",
  ],
  cta: "Explorar agora",
  to: "/meus-cursos",
  poster: "/banner-boas-vindas.jpg",
  video: "/banner-boas-vindas.mp4",
} as const;

function MobileHero() {
  // O video decorativo tem 5,4 MB e engasgava as capas dos cursos no 4G.
  //
  // O `src` fica sempre no elemento (trocar src depois nem sempre dispara o
  // carregamento) e quem segura o download e o preload="none": sem autoplay,
  // o navegador nao baixa nada ate alguem mandar tocar. Chamamos o play()
  // quando a pagina terminou de carregar. O poster aparece o tempo todo.
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let cancelado = false;
    const tocar = () => {
      if (cancelado) return;
      // Falha silenciosa e esperada: alguns navegadores recusam autoplay.
      videoRef.current?.play().catch(() => {});
    };
    if (document.readyState === "complete") {
      const t = window.setTimeout(tocar, 200);
      return () => {
        cancelado = true;
        window.clearTimeout(t);
      };
    }
    window.addEventListener("load", tocar, { once: true });
    return () => {
      cancelado = true;
      window.removeEventListener("load", tocar);
    };
  }, []);

  return (
    <section className="relative overflow-hidden">
      {/* Video na metade direita */}
      <video
        ref={videoRef}
        src={MOBILE_HERO.video}
        poster={MOBILE_HERO.poster}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden
        className="absolute inset-y-0 -right-px h-full w-[calc(66%_+_2px)] object-cover object-[58%_center]"
        style={{
          // dissolve so a beirada esquerda, sem corte reto
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 16%)",
          maskImage: "linear-gradient(to right, transparent 0%, #000 16%)",
        }}
      />

      {/* Escurecimento do lado do texto */}
      <div
        className="compat-scrim-x pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(10,10,10,0.96) 0%, rgba(10,10,10,0.80) 34%, rgba(10,10,10,0.20) 58%, rgba(10,10,10,0) 78%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 65% 60% at 88% 65%, rgba(187,154,53,0.22), transparent 70%)",
        }}
        aria-hidden
      />

      {/* Texto na esquerda */}
      <div className="relative flex min-h-[300px] max-w-[55%] flex-col justify-center py-8 pl-5 pr-1">
        <p className="text-[12px] font-normal text-white/85">{MOBILE_HERO.eyebrow}</p>
        <h1 className="mt-0.5 font-display text-[23px] font-bold leading-[1.08] tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
          {MOBILE_HERO.title}
        </h1>
        <div className="mt-2.5 space-y-1.5">
          {MOBILE_HERO.lines.map((l) => (
            <p key={l} className="text-[11px] leading-relaxed text-white/70">
              {l}
            </p>
          ))}
        </div>
        <Link
          to={MOBILE_HERO.to}
          search={{ tab: "andamento" as const }}
          className="group relative mt-4 inline-flex w-fit items-center gap-2 overflow-hidden rounded-full gradient-gold px-4 py-2.5 text-[12px] font-semibold text-primary-foreground shadow-[0_10px_26px_-10px_var(--nav)] transition active:scale-95"
        >
          <span
            className="diag-sweep pointer-events-none absolute inset-y-0 -left-6 w-12 bg-white/30 blur-md"
            aria-hidden
          />
          <span className="relative">{MOBILE_HERO.cta}</span>
          <ArrowRight className="relative h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

export function MobileTabBar({ current = "/" }: { current?: string }) {
  const items = [
    { icon: HouseSimple, label: "Início", to: "/" },
    { icon: BookOpenText, label: "Cursos", to: "/meus-cursos" },
    { icon: UsersThree, label: "Comunidade", to: "/comunidade" },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-[#0A0A0A] lg:hidden">
      <ul
        className="flex items-stretch"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.35rem)" }}
      >
        {items.map((it) => {
          const active = it.to === current;
          return (
            <li key={it.label} className="flex-1">
              <Link
                to={it.to}
                {...(it.to === "/meus-cursos" ? { search: { tab: "andamento" as const } } : {})}
                className={`flex w-full flex-col items-center gap-1 pb-1.5 pt-2.5 ${
                  active ? "text-[var(--nav)]" : "text-muted-foreground"
                }`}
              >
                <it.icon className="h-[21px] w-[21px]" weight={active ? "fill" : "regular"} />
                <span className="text-[10px] font-medium leading-none tracking-tight">
                  {it.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({
  open,
  onToggle,
  current = "/",
}: {
  open: boolean;
  onToggle: () => void;
  current?: string;
}) {
  const primary = [
    { icon: HouseSimple, label: "Início", to: "/" },
    { icon: BookOpenText, label: "Meus cursos", to: "/meus-cursos" },
    { icon: Certificate, label: "Certificados", to: "/meus-cursos" },
  ];
  const secondary = [
    {
      icon: Headset,
      label: "Suporte",
      href: "https://wa.me/5585991112424?text=Ol%C3%A1%2C%20estou%20na%20%C3%81rea%20de%20Membros%20e%20preciso%20de%20ajuda",
    },
    { icon: GearSix, label: "Configurações", onClick: openSettings },
  ];
  const withActive = <T extends { to?: string; href?: string }>(items: T[]) =>
    items.map((it) => ({ ...it, active: it.to ? it.to === current : false }));

  return (
    <aside
      className={`dark-scope sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-border/60 bg-gradient-to-b from-surface/80 to-background transition-all duration-300 lg:flex ${
        open ? "w-[260px] px-4 py-5" : "w-[76px] items-center py-5 px-3"
      }`}
    >
      {/* Logo */}
      <button
        onClick={onToggle}
        className={`group mb-8 flex items-center rounded-xl transition ${
          open ? "gap-3 px-2" : "justify-center"
        }`}
        title={open ? "Fechar menu" : "Abrir menu"}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
      >
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-primary/25 blur-md opacity-0 transition group-hover:opacity-100" />
          <img
            src={lureLogo.url}
            alt="Lure Digital"
            className={`relative shrink-0 rounded-full object-contain transition-all duration-300 ${
              open ? "h-10 w-10" : "h-9 w-9"
            }`}
          />
        </div>
        {open && (
          <div className="text-left leading-tight">
            <div className="font-display text-[15px] font-bold tracking-[0.14em]">LURE</div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              Growth
            </div>
          </div>
        )}
      </button>

      {/* Nav */}
      <nav className={`flex w-full flex-1 flex-col ${open ? "gap-6" : "items-center gap-6"}`}>
        <NavGroup label="Menu" open={open} items={withActive(primary)} />
        <NavGroup label="Geral" open={open} items={withActive(secondary)} />
      </nav>

      {/* Footer */}
      <div className={`mt-6 flex w-full flex-col ${open ? "gap-3" : "items-center gap-3"}`}>
        {open ? (
          <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-surface-elevated/70 p-4">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent" />
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/20 text-primary">
                  <Crown className="h-3.5 w-3.5" />
                </div>
                <p className="text-xs font-semibold tracking-wide text-primary">Plano Premium</p>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Acesso vitalício a todas as trilhas, mentorias e comunidade.
              </p>
              <button className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/25">
                Ver benefícios
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : (
          <button
            className="grid h-10 w-10 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition hover:bg-primary/20"
            title="Plano Premium"
          >
            <Crown className="h-4 w-4" />
          </button>
        )}
        <ProfileMenu open={open} />
      </div>
    </aside>
  );
}

function NavGroup({
  label,
  open,
  items,
}: {
  label: string;
  open: boolean;
  items: {
    icon: PhosphorIcon;
    label: string;
    active?: boolean;
    href?: string;
    to?: string;
    onClick?: () => void;
  }[];
}) {
  return (
    <div className={`flex w-full flex-col ${open ? "gap-1" : "items-center gap-1.5"}`}>
      {open ? (
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/60">
          {label}
        </div>
      ) : (
        <div className="mb-0.5 h-px w-6 bg-border/60" aria-hidden />
      )}
      {items.map((it) => {
        const base = (
          <>
            {it.active && (
              <>
                <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/25 to-primary/5 ring-1 ring-primary/30" />
                {open && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_16px_-2px_var(--primary)]" />
                )}
              </>
            )}
            <it.icon
              weight={it.active ? "duotone" : "regular"}
              className={`relative h-[19px] w-[19px] shrink-0 ${it.active ? "text-primary" : ""}`}
            />
            {open && <span className="relative">{it.label}</span>}
          </>
        );
        const cls = `group relative flex items-center transition ${
          open
            ? "gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium"
            : "h-11 w-11 items-center justify-center rounded-xl"
        } ${
          it.active
            ? "text-primary"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        }`;

        return it.href ? (
          <a
            key={it.label}
            href={it.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cls}
            title={!open ? it.label : undefined}
          >
            {base}
          </a>
        ) : it.to ? (
          <Link key={it.label} to={it.to} className={cls} title={!open ? it.label : undefined}>
            {base}
          </Link>
        ) : (
          <button
            key={it.label}
            onClick={it.onClick}
            className={cls}
            title={!open ? it.label : undefined}
          >
            {base}
          </button>
        );
      })}
    </div>
  );
}

export { initialsOf };

function ProfileMenu({ open }: { open: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { profile, session, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const name = profile?.full_name || profile?.email?.split("@")[0] || "Aluno LURE";
  const email = profile?.email || session?.user?.email || "";
  const roleLabel = isAdmin ? "Administrador" : "Membro";

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate({ to: "/login", replace: true });
  };

  const openProfileSettings = () => {
    setMenuOpen(false);
    openSettings();
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      {open ? (
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
            menuOpen
              ? "border-primary/40 bg-surface-elevated"
              : "border-border bg-surface hover:bg-surface-elevated"
          }`}
        >
          <Avatar
            url={profile?.avatar_url}
            name={profile?.full_name}
            email={email}
            className="h-10 w-10"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-xs text-muted-foreground">{roleLabel}</div>
          </div>
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-muted-foreground transition ${menuOpen ? "rotate-90" : ""}`}
          />
        </button>
      ) : (
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="relative flex h-11 w-11 items-center justify-center rounded-full ring-2 ring-transparent transition hover:ring-primary/40"
          title={name}
          aria-label="Abrir menu do perfil"
        >
          <Avatar
            url={profile?.avatar_url}
            name={profile?.full_name}
            email={email}
            className="h-10 w-10"
          />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-surface" />
        </button>
      )}

      {menuOpen && (
        <div
          className={`absolute z-50 w-56 overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-2xl ${
            open ? "bottom-full left-0 right-0 mb-2 w-auto" : "bottom-0 left-full ml-3"
          }`}
        >
          <div className="border-b border-border px-3 py-3">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-xs text-muted-foreground">{email}</div>
          </div>
          <div className="p-1.5">
            <button
              onClick={openProfileSettings}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground/90 transition hover:bg-muted"
            >
              <Settings className="h-4 w-4" />
              Editar perfil
            </button>
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground/90 transition hover:bg-muted"
              >
                <ShieldCheck className="h-4 w-4" />
                Administração
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-400 transition hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressPill() {
  // Progresso geral: aulas concluidas / aulas que existem de verdade. Somar o
  // `lessons` do catalogo dava um total de fantasia (mais de 300 aulas).
  const byCourse = useCourseProgress();
  const totais = useContext(TotalsContext);
  const { byKey } = useContext(LocksContext);
  const { isAdmin } = useAuth();
  // Modulo trancado nao conta pro aluno: ele nem enxerga o card, e entrar no
  // divisor so faria a barra dele nunca chegar ao fim.
  const mods = sections.flatMap((s) =>
    s.modules.filter((m) => isAdmin || !byKey[moduleKey(s.id, m)]?.locked),
  );
  const aulasDe = (m: Module) => totais[moduleSlug(m.title)] ?? AULAS_FIXAS;
  const total = mods.reduce((a, m) => a + aulasDe(m), 0);
  const done = mods.reduce(
    (a, m) => a + Math.round((aulasDe(m) * (byCourse[moduleSlug(m.title)] ?? 0)) / 100),
    0,
  );
  const pct = total ? Math.round((done / total) * 100) : 0;

  const r = 15.5;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div
      title={`${done} de ${total} aulas concluídas`}
      className="group relative hidden items-center gap-3 overflow-hidden rounded-full border border-primary/25 bg-surface/80 py-1.5 pl-1.5 pr-4 shadow-sm backdrop-blur-md transition hover:border-primary/55 hover:shadow-[0_0_24px_-8px_var(--primary)] sm:flex"
    >
      {/* brilho azul que acompanha o progresso */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-primary/22 to-transparent transition-all duration-700"
        style={{ width: `${Math.max(pct, 8)}%` }}
      />
      <div className="relative h-10 w-10 shrink-0">
        <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            strokeWidth="3.5"
            className="stroke-foreground/12"
          />
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke="url(#lureProgress)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
              filter: "drop-shadow(0 0 4px var(--primary))",
            }}
          />
          <defs>
            <linearGradient id="lureProgress" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#EBDDA9" />
              <stop offset="100%" stopColor="#BB9A35" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-foreground">
          {pct}%
        </span>
      </div>
      <div className="relative flex flex-col leading-tight">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Seu progresso
        </span>
        <span className="text-[12px] font-semibold tabular-nums text-foreground">
          {done}
          <span className="text-muted-foreground">/{total} aulas</span>
        </span>
      </div>
    </div>
  );
}

export function TopBar() {
  const { profile, session, isAdmin } = useAuth();
  const name = profile?.full_name || profile?.email?.split("@")[0] || "Aluno LURE";
  const email = profile?.email || session?.user?.email;
  const roleLabel = isAdmin ? "Administrador" : "Membro";
  return (
    // Sem backdrop-blur aqui de proposito: a barra fica parada no topo enquanto
    // a pagina inteira corre por baixo, entao o navegador teria que reborrar essa
    // faixa a cada quadro — e a rolagem engasga. Como o fundo ja era /90, opaco
    // fica praticamente igual e nao custa nada.
    <header className="dark-scope sticky top-0 z-30 flex h-18 items-center justify-between gap-4 border-b border-border/50 bg-background px-6 md:px-10 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-foreground shadow-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          placeholder="Buscar cursos, aulas, mentores..."
          className="w-56 bg-transparent outline-none placeholder:text-muted-foreground md:w-80"
        />
      </div>
      <div className="flex items-center gap-3">
        <ProgressPill />
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted-foreground transition hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
        </button>
        <button
          onClick={openSettings}
          title="Editar perfil"
          className="flex items-center gap-3 rounded-full border border-border bg-surface pl-1 pr-4 py-1 transition hover:border-primary/40"
        >
          <div className="relative h-8 w-8">
            <Avatar
              url={profile?.avatar_url}
              name={profile?.full_name}
              email={email}
              className="h-8 w-8"
              textClassName="text-[11px]"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-surface" />
          </div>
          <div className="text-sm text-left">
            <div className="font-medium leading-tight">{name}</div>
            <div className="text-[11px] leading-tight text-muted-foreground">{roleLabel}</div>
          </div>
        </button>
      </div>
    </header>
  );
}

function HeroBanner() {
  return (
    <section className="relative overflow-hidden border-b border-primary/30">
      {/* Banner estilo Kiwify: imagem completa (texto ja embutido na arte), exibida inteira
          na proporcao nativa — w-full/h-auto, entao nunca corta e escala em todo device. */}
      <div className="relative w-full">
        {/* Primeira coisa que aparece na tela: pede prioridade em vez de
            disputar a fila com as capas que estao abaixo da dobra. */}
        <img
          src="/banner-assessoria-lure.jpg"
          alt="Assessoria Lure"
          fetchPriority="high"
          decoding="async"
          className="block w-full h-auto"
        />
      </div>
    </section>
  );
}

function SectionRow({ section }: { section: (typeof sections)[number] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { isAdmin } = useAuth();
  const { byKey, carregado } = useContext(LocksContext);

  // Modulo trancado nao existe para o aluno: nem card, nem cadeado, nem "em
  // breve". O admin continua vendo tudo, senao nao teria como destravar.
  //
  // Le o contexto direto em vez de `useModuleLock` por modulo: hook dentro de
  // laco nao vale, e a ordem dos hooks mudaria a cada modulo trancado.
  const modules = isAdmin
    ? section.modules
    : section.modules.filter((m) => !byKey[moduleKey(section.id, m)]?.locked);

  // Enquanto nao se sabe quem esta trancado, o aluno nao ve nada — mostrar e
  // depois esconder seria justamente entregar o que era pra ficar escondido.
  if (!isAdmin && !carregado) return null;

  // Secao inteira trancada sai da pagina — titulo sozinho, sem card embaixo,
  // parece pagina quebrada.
  if (modules.length === 0) return null;

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = card ? card.offsetWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section className="mt-10 lg:mt-14">
      <div className="mb-4 flex items-end justify-between gap-3 lg:mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-[3px] shrink-0 rounded-full bg-[var(--nav)]" aria-hidden />
            <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--nav)]">
              {section.title}
            </span>
          </div>
          <h2 className="mt-1.5 font-display text-[17px] font-semibold leading-snug tracking-tight text-foreground lg:text-[19px]">
            {section.subtitle}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-sm text-muted-foreground">
          <span className="hidden lg:inline">
            {modules.length} {modules.length === 1 ? "módulo" : "módulos"}
          </span>
          <span className="hidden h-4 w-px bg-white/15 lg:block" aria-hidden />
          <button className="flex items-center gap-1 whitespace-nowrap text-[13px] text-[var(--nav)] transition hover:brightness-125 lg:text-sm">
            Ver todos <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile: grade de duas colunas, como um app */}
      <div className="grid grid-cols-2 gap-3.5 lg:hidden">
        {modules.map((m, i) => (
          <MobileModuleCard key={m.title} m={m} sectionId={section.id} index={i} />
        ))}
      </div>

      {/* Desktop: carrossel horizontal */}
      <div className="relative hidden lg:block">
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => scrollBy(-1)}
          className="absolute -left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-lg backdrop-blur transition hover:border-primary/50 hover:text-primary lg:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Próximo"
          onClick={() => scrollBy(1)}
          className="absolute -right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-lg backdrop-blur transition hover:border-primary/50 hover:text-primary lg:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Cuidado com `snap-mandatory` + `scroll-smooth` juntos aqui: o carrossel
            volta a se encaixar sozinho a cada mexida de layout — e no PC o card
            sob o cursor sobe no hover (`hover:-translate-y-1`) o tempo todo
            enquanto a pessoa rola. Cada reencaixe vira uma animação que cancela a
            rolagem da página, e ela parece travada. No celular não aparece porque
            não tem hover e a lista vira grade. `snap-proximity` sugere o encaixe
            sem forçar; o "suave" das setas continua vindo do scrollBy. */}
        <div
          ref={scrollerRef}
          className="flex snap-x snap-proximity gap-5 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {modules.map((m) => (
            <div
              key={m.title}
              data-card
              className="w-[calc(100%-1rem)] shrink-0 snap-start sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.833rem)] xl:w-[calc(25%-0.9375rem)]"
            >
              <ModuleCard m={m} sectionId={section.id} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Card do mobile: capa quadrada, titulo embaixo e progresso — layout de app. */
export function MobileModuleCard({
  m,
  sectionId,
  index = 0,
}: {
  m: Module;
  sectionId: string;
  index?: number;
}) {
  const chave = moduleKey(sectionId, m);
  const covers = useContext(CoversContext);
  const thumb = covers[chave] ?? m.thumb;
  const slug = moduleSlug(m.title);
  const progress = useCourseProgress()[slug] ?? 0;

  const { isAdmin } = useAuth();
  const { locked, podeTrancar, alternar } = useModuleLock(chave);
  const bloqueado = locked && !isAdmin;

  const linkProps = m.moduleId
    ? ({ to: "/modulo/$id", params: { id: m.moduleId } } as const)
    : ({ to: "/curso/$slug", params: { slug } } as const);

  // O cadeado do admin é botão e mora fora do <Link> — link não pode ter botão
  // dentro, e no toque do celular os dois disparariam juntos.
  return (
    <div
      className="lure-rise group relative h-full"
      style={{ "--d": `${index * 70}ms` } as React.CSSProperties}
    >
    {/* `h-full` nos dois: o item da grade agora e a <div>, e sem repassar a
        altura pro <Link> o card para no tamanho do conteudo. Numa dupla em
        que so um card mostra o titulo, os dois terminavam em alturas
        diferentes. */}
    <Link
      {...linkProps}
      onClick={(e) => {
        if (bloqueado) e.preventDefault();
      }}
      aria-disabled={bloqueado}
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border border-primary/25 bg-surface/60 transition ${
        bloqueado ? "cursor-not-allowed" : "active:scale-[0.98]"
      }`}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-black">
            <img
              src={lureLogo.url}
              alt=""
              aria-hidden
              className="h-12 w-12 object-contain opacity-90"
            />
          </div>
        )}
        <div className="compat-scrim-y absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        {locked && <div className="absolute inset-0 bg-background/45" />}
        {m.tag && (
          <span className="absolute left-2.5 top-2.5 rounded-lg bg-black/70 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur">
            {m.tag}
          </span>
        )}
        {/* Selo do aluno. O do admin é botão e fica fora do <Link>, logo abaixo. */}
        {locked && !isAdmin && (
          <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-lg bg-black/70 text-white/85 backdrop-blur">
            <Lock className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        {/* A capa ja traz o nome do curso; o texto so entra quando nao ha capa */}
        {!thumb && (
          <h3 className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">
            {m.title}
          </h3>
        )}
        <div className="mt-auto flex items-center gap-2.5 pt-2">
          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
            {progress}%
          </span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full gradient-gold transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </span>
        </div>
      </div>
    </Link>

    {/* Cadeado do admin: um toque libera o módulo pra todo mundo. */}
    {isAdmin && podeTrancar && (
      <button
        type="button"
        onClick={alternar}
        title={locked ? "Liberar módulo para os alunos" : "Trancar módulo"}
        aria-label={locked ? "Liberar módulo para os alunos" : "Trancar módulo"}
        className={`absolute right-2.5 top-2.5 z-30 grid h-8 w-8 place-items-center rounded-lg backdrop-blur transition active:scale-90 ${
          locked ? "bg-primary/25 text-primary" : "bg-black/60 text-white/70"
        }`}
      >
        {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
      </button>
    )}
    </div>
  );
}

function ModuleCard({ m, sectionId }: { m: Module; sectionId: string }) {
  // Cor neutra e fixa para todos os cards — sem paleta colorida
  const accentBar = "bg-foreground/70";
  const glow = "rgba(187, 154, 53, 0.10)";

  // Capa salva no painel admin (banco) tem prioridade sobre a imagem fixa do código.
  const chave = moduleKey(sectionId, m);
  const covers = useContext(CoversContext);
  const thumb = covers[chave] ?? m.thumb;

  const slug = moduleSlug(m.title);
  const progress = useCourseProgress()[slug] ?? 0;
  // Do banco, nao do catalogo: `m.lessons` e `m.author` sao do prototipo.
  const totalAulas = useCourseLessonCount(slug);
  const autor = useContext(AuthorsContext)[chave] ?? m.author;

  const { isAdmin } = useAuth();
  const { locked, podeTrancar, alternar } = useModuleLock(chave);
  // O admin atravessa o cadeado — precisa entrar pra montar o módulo.
  const bloqueado = locked && !isAdmin;

  const linkProps = m.moduleId
    ? ({ to: "/modulo/$id", params: { id: m.moduleId } } as const)
    : ({ to: "/curso/$slug", params: { slug } } as const);

  // O botão do cadeado fica fora do <Link> de propósito: link não pode ter
  // botão dentro, e sem essa separação o mesmo clique destravava e navegava.
  // Por isso o hover mora no <div> de fora, e o card inteiro é o `group`.
  //
  // Sobre as transições: `transition` sozinho anima *todas* as propriedades,
  // sombra inclusive — e animar sombra repinta o card inteiro. Como o cursor
  // atravessa varios cards enquanto a pessoa rola, isso vira repintura em
  // serie. Separadas assim, a sombra ainda aparece no hover, so que de uma vez.
  return (
    <div className="group relative h-[440px] transition-transform duration-200 hover:-translate-y-1">
    <Link
      {...linkProps}
      onClick={(e) => {
        if (bloqueado) e.preventDefault();
      }}
      aria-disabled={bloqueado}
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border border-primary/30 bg-card transition-[border-color] duration-200 group-hover:border-primary/60 group-hover:shadow-[var(--shadow-card)] ${
        bloqueado ? "cursor-not-allowed" : ""
      }`}
    >
      {/* Optional thumb background */}
      {thumb && (
        <img
          src={thumb}
          alt={m.title}
          loading="lazy"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      )}
      {!thumb && (
        <>
          {/* Sem foto: logo da LURE em fundo preto */}
          <div className="pointer-events-none absolute inset-0 bg-black" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <img
              src={lureLogo.url}
              alt="LURE"
              className="h-20 w-20 object-contain opacity-90 transition duration-500 group-hover:scale-105"
            />
          </div>
          {/* Brilho sutil embaixo pra dar profundidade */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
            style={{
              background: `radial-gradient(ellipse 70% 90% at 50% 100%, ${glow}, transparent 70%)`,
            }}
          />
          {/* Risco de luz dourada subindo pro canto, como na arte da marca */}
          <div className="pointer-events-none absolute -right-4 bottom-32 h-2 w-3/5 origin-right -rotate-[26deg] bg-gradient-to-r from-transparent via-primary/30 to-primary/70 blur-md" />
          <div className="pointer-events-none absolute -right-4 bottom-32 h-[2px] w-3/5 origin-right -rotate-[26deg] bg-gradient-to-r from-transparent via-primary/70 to-[#F4D67A]" />
          <div className="pointer-events-none absolute -right-4 bottom-[6.75rem] h-px w-2/5 origin-right -rotate-[26deg] bg-gradient-to-r from-transparent to-primary/50" />
        </>
      )}

      {/* Véu no card trancado: o preto do fundo sozinho não diz "fechado". */}
      {locked && <div className="pointer-events-none absolute inset-0 bg-background/45" />}

      {/* Hover play — no lugar dele o admin tem o cadeado, e o card trancado
          não tem o que tocar. Nos poucos cards sem linha no banco não há
          cadeado pra pôr ali, então o play continua valendo até pro admin. */}
      {!locked && (!isAdmin || !podeTrancar) && (
        // `group-hover:backdrop-blur` em vez de `backdrop-blur` solto: com
        // opacity-0 nao se ve nada, mas o borrao continua sendo calculado do
        // mesmo jeito, em todo card da tela, a cada quadro. Assim ele so passa a
        // existir quando o mouse esta em cima — mesmo visual, custo zero parado.
        <div className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/70 opacity-0 transition group-hover:opacity-100 group-hover:backdrop-blur">
          <Play className="h-4 w-4 fill-primary text-primary" />
        </div>
      )}

      {/* Selo do aluno: fixo, porque no celular não existe hover pra revelar. */}
      {locked && !isAdmin && (
        <div className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground">
          <Lock className="h-4 w-4" />
        </div>
      )}

      {/* Header */}
      <div className="relative flex flex-1 flex-col p-6">
        {m.tag && (
          <span className="mb-4 inline-flex w-fit items-center rounded-md bg-background/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">
            {m.tag}
          </span>
        )}
        {/* A capa ja traz o titulo escrito; so mostramos texto quando nao ha capa. */}
        {!thumb && <h3 className="font-display text-xl font-bold leading-snug">{m.title}</h3>}

        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
          <span className="truncate">{autor}</span>
          <span className="flex shrink-0 items-center gap-1">
            <Play className="h-3 w-3" /> {totalAulas} {totalAulas === 1 ? "aula" : "aulas"}
          </span>
        </div>
      </div>

      {/* Progress bar flush to card bottom */}
      <div className="relative h-1.5 w-full bg-background/70">
        <div className={`h-full ${accentBar}`} style={{ width: `${progress}%` }} />
      </div>

      {/* "Em gravação" overlay — aparece ao passar o mouse */}
      {locked && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/70 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-5 py-3 text-center backdrop-blur">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Em gravação...
            </span>
            <span className="text-[11px] text-muted-foreground">
              {isAdmin ? "Clique no cadeado para liberar" : "Novo módulo em breve"}
            </span>
          </div>
        </div>
      )}
    </Link>

    {/* Só o admin vê. Trancado, o cadeado fica sempre à mostra; liberado, ele
        aparece no hover pra não poluir o card de quem já está no ar. */}
    {isAdmin && podeTrancar && (
      <button
        type="button"
        onClick={alternar}
        title={locked ? "Liberar módulo para os alunos" : "Trancar módulo"}
        aria-label={locked ? "Liberar módulo para os alunos" : "Trancar módulo"}
        className={`absolute right-5 top-5 z-30 flex h-10 w-10 items-center justify-center rounded-full border transition ${
          locked
            ? "border-primary/40 bg-background/85 text-primary opacity-100"
            : "border-border bg-background/70 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
        }`}
      >
        {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
      </button>
    )}
    </div>
  );
}

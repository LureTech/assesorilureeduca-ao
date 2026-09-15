import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Play, Settings, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { SECTIONS } from "@/lib/sections";

type CardModule = {
  id: string;
  section_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  lessonCount: number;
};

/**
 * Catálogo da home, vindo do banco. Cada seção vira uma trilha horizontal.
 * Admin tem atalho pra gerenciar e para adicionar módulo em cada seção.
 */
export function DbModules() {
  const { isAdmin } = useAuth();
  const [modules, setModules] = useState<CardModule[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("modules")
      .select("id, section_id, title, author, cover_url, sort_order, module_lessons(count)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const rows = (data ?? []).map(
          (r: {
            id: string;
            section_id: string;
            title: string;
            author: string | null;
            cover_url: string | null;
            module_lessons: { count: number }[];
          }) => ({
            id: r.id,
            section_id: r.section_id,
            title: r.title,
            author: r.author,
            cover_url: r.cover_url,
            lessonCount: r.module_lessons?.[0]?.count ?? 0,
          }),
        );
        setModules(rows);
        setLoaded(true);
      });
  }, []);

  if (!loaded) return null;

  const groups = SECTIONS.map((s) => ({
    section: s,
    items: modules.filter((m) => m.section_id === s.id),
  })).filter((g) => g.items.length > 0 || isAdmin);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-14 pt-8">
      {isAdmin && (
        <div className="flex items-center justify-end">
          <Link
            to="/admin/modulos"
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            <Settings className="h-3.5 w-3.5" /> Gerenciar módulos
          </Link>
        </div>
      )}

      {groups.map((g) => (
        <Rail key={g.section.id} section={g.section} items={g.items} isAdmin={isAdmin} />
      ))}
    </div>
  );
}

function Rail({
  section,
  items,
  isAdmin,
}: {
  section: { id: string; title: string; subtitle: string };
  items: CardModule[];
  isAdmin: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = card ? card.offsetWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold tracking-[0.14em]">{section.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{section.subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{items.length} módulos</span>
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Anterior"
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-surface text-foreground transition hover:border-primary/50 hover:text-primary md:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Próximo"
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-surface text-foreground transition hover:border-primary/50 hover:text-primary md:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mesmo cuidado do carrossel da home: `snap-mandatory` junto de
          `scroll-smooth` faz o container se reencaixar sozinho a cada hover de
          card e engolir a rolagem vertical da página no PC. */}
      <div
        ref={scroller}
        className="flex snap-x snap-proximity gap-5 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((m) => (
          <div
            key={m.id}
            data-card
            className="w-[calc(100%-1rem)] shrink-0 snap-start sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.833rem)] xl:w-[calc(25%-0.9375rem)]"
          >
            <ModuleCard m={m} />
          </div>
        ))}

        {isAdmin && (
          <div
            data-card
            className="w-[calc(100%-1rem)] shrink-0 snap-start sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.833rem)] xl:w-[calc(25%-0.9375rem)]"
          >
            <Link
              to="/admin/modulos"
              className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border text-center transition hover:border-primary/50 hover:bg-card/40"
            >
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold">Novo módulo em {section.title}</span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function ModuleCard({ m }: { m: CardModule }) {
  // Nao troque o `transition-[transform,border-color]` por `transition` solto:
  // animar sombra repinta o card inteiro, e o cursor passa por varios deles
  // enquanto a pessoa rola.
  return (
    <Link
      to="/modulo/$id"
      params={{ id: m.id }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[transform,border-color] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-card)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {m.cover_url ? (
          <img
            src={m.cover_url}
            alt={m.title}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-black">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 80% 70% at 50% 120%, rgba(187, 154, 53, 0.28), transparent 65%)",
              }}
            />
            <span className="absolute bottom-3 left-4 font-display text-[11px] font-bold uppercase tracking-[0.28em] text-white/25">
              {m.section_id}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
        {/* Blur so no hover: com opacity-0 nao aparece, mas seria calculado a cada
            quadro em todo card da tela. */}
        <div className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-background/70 text-primary opacity-0 transition group-hover:opacity-100 group-hover:backdrop-blur">
          <Play className="h-4 w-4 fill-current" />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 font-display text-[15px] font-bold leading-snug">{m.title}</h3>
        <div className="mt-auto flex items-center justify-between pt-3 text-xs text-muted-foreground">
          <span className="truncate">{m.author ?? "LURE"}</span>
          <span className="flex shrink-0 items-center gap-1">
            <Play className="h-3 w-3" /> {m.lessonCount} {m.lessonCount === 1 ? "aula" : "aulas"}
          </span>
        </div>
      </div>
    </Link>
  );
}

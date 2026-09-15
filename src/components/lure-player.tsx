import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { parseYouTubeId } from "@/lib/youtube";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Carrega a API do YouTube uma única vez (singleton). */
let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    // Se o script for bloqueado (adblock/rede), resolve mesmo assim para o
    // player cair no embed simples em vez de ficar carregando para sempre.
    tag.onerror = () => resolve();
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Player de vídeo da LURE. Reproduz um vídeo do YouTube SEM a aparência do
 * YouTube: controles próprios, sem logo/título/relacionados, e uma camada que
 * intercepta cliques/hover para o cliente nunca ir parar no YouTube.
 */
export function LurePlayer({
  videoUrl,
  startAt,
  className = "",
  onEnded,
  onDuration,
  onPlayingChange,
  onTime,
}: {
  videoUrl: string;
  /** Retoma a partir deste segundo (onde o aluno parou). */
  startAt?: number;
  className?: string;
  onEnded?: () => void;
  /** Duração do vídeo em segundos, assim que o YouTube informa. */
  onDuration?: (seconds: number) => void;
  /** true quando começa a tocar, false ao pausar/terminar. */
  onPlayingChange?: (playing: boolean) => void;
  /** Tempo atual (segundos) — dispara periodicamente enquanto toca. */
  onTime?: (seconds: number) => void;
}) {
  const id = parseYouTubeId(videoUrl);
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  /** Enquanto true, estamos so enchendo o buffer em mudo — nao e o play do usuario. */
  const warmingRef = useRef(false);
  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;
  const endedCb = useRef(onEnded);
  endedCb.current = onEnded;
  const cbs = useRef({ onDuration, onPlayingChange, onTime });
  cbs.current = { onDuration, onPlayingChange, onTime };

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isFs, setIsFs] = useState(false);
  /** Plano B: se a API não responder, mostramos o embed simples do YouTube. */
  const [fallback, setFallback] = useState(false);
  /** Vira true no primeiro play: antes disso a capa esconde a marca do YouTube. */
  const [started, setStarted] = useState(false);
  /** Segura a capa por alguns segundos depois do play (avisos do YouTube). */
  const [coverHold, setCoverHold] = useState(false);
  const startedRef = useRef(false);
  startedRef.current = started;
  const [showUi, setShowUi] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);

  // Inicializa o player quando a API e o id estiverem prontos.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setReady(false);
    setPlaying(false);
    setEnded(false);
    setCurrent(0);
    setFallback(false);
    setStarted(false);
    setCoverHold(false);

    // Se em 8s o player não ficou pronto, o embed simples assume.
    const guard = window.setTimeout(() => {
      if (!cancelled) setFallback(true);
    }, 8000);

    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      const YT = (window as any).YT;
      if (!YT?.Player) {
        setFallback(true);
        return;
      }
      // A API do YouTube SUBSTITUI o elemento passado pelo iframe. Por isso
      // damos a ela um filho descartável: o host continua no DOM e trocar de
      // aula (ou remontar o componente) sempre encontra um alvo válido.
      hostRef.current.innerHTML = "";
      const mount = document.createElement("div");
      hostRef.current.appendChild(mount);
      playerRef.current = new YT.Player(mount, {
        videoId: id,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          cc_load_policy: 0,
          cc_lang_pref: "pt",
          hl: "pt-BR",
          vq: "hd1080",
          origin: window.location.origin,
        },
        events: {
          onReady: (e: any) => {
            if (cancelled) return;
            window.clearTimeout(guard);
            setReady(true);
            const d = e.target.getDuration?.() || 0;
            setDuration(d);
            if (d) cbs.current.onDuration?.(d);
            setVolume(e.target.getVolume?.() ?? 100);
            setMuted(e.target.isMuted?.() ?? false);
            // Remove de vez o modulo de legendas (inclusive as automaticas)
            try {
              e.target.unloadModule?.("captions");
              e.target.unloadModule?.("cc");
            } catch {
              /* noop */
            }
            // Pede a melhor qualidade disponivel
            try {
              e.target.setPlaybackQuality?.("hd1080");
            } catch {
              /* noop */
            }
            // Enche o buffer em mudo para o play do aluno comecar na hora
            try {
              warmingRef.current = true;
              e.target.mute?.();
              e.target.playVideo?.();
              // Se o navegador barrar o autoplay mudo (acontece bastante no app
              // instalado), o estado PLAYING nunca chega e a flag ficaria presa
              // em true — sequestrando o primeiro play do aluno. Solta sozinha.
              window.setTimeout(() => {
                if (warmingRef.current) {
                  warmingRef.current = false;
                  try {
                    e.target.unMute?.();
                  } catch {
                    /* noop */
                  }
                }
              }, 4000);
            } catch {
              warmingRef.current = false;
            }
          },
          onStateChange: (e: any) => {
            const S = (window as any).YT.PlayerState;
            // Aquecimento: assim que comeca a rodar em mudo, pausa e volta ao inicio
            if (warmingRef.current && e.data === S.PLAYING) {
              warmingRef.current = false;
              try {
                e.target.pauseVideo?.();
                const resume = startAtRef.current;
                e.target.seekTo?.(resume && resume > 5 ? resume : 0, true);
                e.target.unMute?.();
                if (resume && resume > 5) setCurrent(resume);
              } catch {
                /* noop */
              }
              return;
            }
            if (e.data === S.PLAYING) {
              setPlaying(true);
              setStarted(true);
              setEnded(false);
              try {
                e.target.unloadModule?.("captions");
                e.target.unloadModule?.("cc");
                e.target.setPlaybackQuality?.("hd1080");
              } catch {
                /* noop */
              }
              const d = e.target.getDuration?.() || 0;
              setDuration(d);
              if (d) cbs.current.onDuration?.(d);
              cbs.current.onPlayingChange?.(true);
            } else if (e.data === S.PAUSED) {
              if (!startedRef.current) return; // pausa do aquecimento
              setPlaying(false);
              cbs.current.onPlayingChange?.(false);
            } else if (e.data === S.ENDED) {
              setPlaying(false);
              setEnded(true);
              cbs.current.onPlayingChange?.(false);
              endedCb.current?.();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(guard);
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      playerRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [id]);

  // A capa fica mais 1.2s depois do play (tempo dos avisos do YouTube) e
  // some em seguida, ja com o video rodando por tras.
  useEffect(() => {
    if (!playing) return;
    setCoverHold(true);
    const t = window.setTimeout(() => setCoverHold(false), 1600);
    return () => window.clearTimeout(t);
  }, [playing]);

  // Atualiza o tempo enquanto toca.
  useEffect(() => {
    if (!playing) return;
    const iv = window.setInterval(() => {
      const p = playerRef.current;
      if (p?.getCurrentTime) {
        const t = p.getCurrentTime() || 0;
        setCurrent(t);
        cbs.current.onTime?.(t);
        const d = p.getDuration?.() || 0;
        if (d) setDuration((prev) => (Math.abs(prev - d) > 0.5 ? d : prev));
      }
    }, 500);
    return () => window.clearInterval(iv);
  }, [playing]);

  // Pausa o vídeo (e o cronômetro) quando o usuário sai da aba / minimiza.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        try {
          playerRef.current?.pauseVideo?.();
        } catch {
          /* noop */
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Sincroniza estado de tela cheia.
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;

    // Clique do aluno cancela o aquecimento na hora. Sem isso, se o autoplay
    // mudo tiver sido barrado, o onStateChange trataria este play como
    // pre-carregamento e pausaria o video de volta pro inicio — o famoso
    // "aperto play e nao vai". O unMute e porque quem mutou fomos nos.
    if (warmingRef.current) {
      warmingRef.current = false;
      try {
        p.unMute?.();
      } catch {
        /* noop */
      }
    }

    if (ended) {
      p.seekTo(0, true);
      p.playVideo();
      setEnded(false);
      return;
    }
    if (playing) p.pauseVideo();
    else p.playVideo();
  }, [playing, ended]);

  const seekTo = (clientX: number, el: HTMLElement) => {
    const p = playerRef.current;
    if (!p || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = ratio * duration;
    p.seekTo(t, true);
    setCurrent(t);
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (muted || volume === 0) {
      p.unMute();
      const v = volume === 0 ? 60 : volume;
      p.setVolume(v);
      setVolume(v);
      setMuted(false);
    } else {
      p.mute();
      setMuted(true);
    }
  };

  const changeVolume = (v: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.setVolume(v);
    if (v === 0) {
      p.mute();
      setMuted(true);
    } else {
      p.unMute();
      setMuted(false);
    }
    setVolume(v);
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const poke = useCallback(() => {
    setShowUi(true);
    window.clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = window.setTimeout(() => setShowUi(false), 2600);
  }, [playing]);

  if (!id) {
    return (
      <div className={`grid place-items-center bg-black text-sm text-white/60 ${className}`}>
        Vídeo indisponível.
      </div>
    );
  }

  // API indisponível: embed direto, com os controles do próprio YouTube.
  if (fallback && !ready) {
    return (
      <div className={`relative overflow-hidden bg-black ${className}`}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&cc_load_policy=0&iv_load_policy=3&vq=hd1080`}
          title="Aula"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  }

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className={`group relative select-none overflow-hidden bg-black ${className}`}
      onMouseMove={poke}
      onMouseLeave={() => playing && setShowUi(false)}
    >
      {/* Host do YouTube (iframe injetado aqui). pointer-events off = nenhum clique
          nem hover chega no YT, entao a barra de titulo e o "Assistir no YouTube"
          nao sao acionados. O video ocupa 100% — sem zoom. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          ref={hostRef}
          className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 [&>iframe]:h-full [&>iframe]:w-full"
        />
      </div>

      {/* Máscara superior — mata a barra de título do YouTube durante a reprodução */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-black via-black/65 to-transparent" />

      {/* Máscara inferior — sempre presente, cobre onde o selo do YouTube aparece */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-black via-black/70 to-transparent" />

      {/* Capa: cobre o player sempre que o video nao esta rodando (inicio, pausa,
          fim) e ainda segura ~1.6s depois do play, tempo em que o YouTube mostra
          titulo e canal. Assim a marca dele nunca aparece. */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 overflow-hidden transition-opacity duration-500 ${
          !playing || coverHold ? "opacity-100" : "opacity-0"
        }`}
      >
        <img
          src={`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
          }}
        />
        <div className="absolute inset-0 bg-black/45" />
      </div>

      {/* Escudo de clique: bloqueia hover/click do YT e faz play/pause */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        className="absolute inset-0 z-30 h-full w-full cursor-pointer"
      />

      {/* Carregando */}
      {!ready && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Play central quando pausado */}
      {ready && !playing && !ended && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-primary/95 shadow-[var(--shadow-glow)] transition group-hover:scale-105">
            <Play className="ml-1 h-8 w-8 fill-primary-foreground text-primary-foreground" />
          </span>
        </div>
      )}

      {/* Fim do vídeo — cobre o "endscreen" do YouTube */}
      {ended && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/85 backdrop-blur-sm">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110"
          >
            <RotateCcw className="h-4 w-4" /> Assistir de novo
          </button>
        </div>
      )}

      {/* Barra de controles própria */}
      <div
        className={`absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-8 transition-opacity duration-300 md:px-4 ${
          showUi || !playing ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Progresso */}
        <div
          className="group/bar relative h-3 cursor-pointer"
          onClick={(e) => seekTo(e.clientX, e.currentTarget)}
        >
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-white/25">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow transition group-hover/bar:opacity-100"
            style={{ left: `${pct}%` }}
          />
        </div>

        {/* Botões */}
        <div className="mt-1 flex items-center gap-3 text-white">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pausar" : "Reproduzir"}
            className="transition hover:text-primary"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-label="Mudo"
              className="transition hover:text-primary"
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volume"
              className="hidden h-1 w-20 cursor-pointer accent-primary sm:block"
            />
          </div>

          <div className="text-xs tabular-nums text-white/80">
            {fmt(current)} <span className="text-white/40">/</span> {fmt(duration)}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40 sm:inline">
              LURE Player
            </span>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Tela cheia"
              className="transition hover:text-primary"
            >
              {isFs ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

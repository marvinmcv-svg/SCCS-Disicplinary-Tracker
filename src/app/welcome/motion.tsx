'use client';

// Client-only motion leaves for the landing page. Every animation honours
// prefers-reduced-motion and only animates transform/opacity.
import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Play } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

const noopSubscribe = () => () => {};

/** Reduced-motion preference, read only after hydration so the server and
 *  first client render always match. */
function useReducedAfterMount() {
  const pref = useReducedMotion();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return hydrated && !!pref;
}

/** Wrap the page: Motion skips transform animations for reduced-motion users. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fade/slide a block in once it enters the viewport (reveals in reading order). */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Hero device stack: the laptop screen settles and the phone rises as you scroll. */
export function HeroDevices({ desktop, phone }: { desktop: string; phone: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedAfterMount();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const phoneY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [40, -40]);
  const screenScale = useTransform(scrollYProgress, [0, 0.5], reduce ? [1, 1] : [0.96, 1]);
  return (
    <div ref={ref} className="relative">
      <motion.div
        style={{ scale: screenScale }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: EASE, delay: 0.15 }}
        className="wl-window"
      >
        <div className="wl-window-bar" aria-hidden="true"><span /><span /><span /></div>
        <img src={desktop} alt="SCCS dashboard with incident totals, quick actions and early-warning alerts" width={1440} height={900} className="block w-full h-auto" fetchPriority="high" />
      </motion.div>
      <motion.div
        style={{ y: phoneY }}
        initial={{ opacity: 0, y: 80 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, ease: EASE, delay: 0.35 }}
        className="wl-phone absolute -bottom-10 -right-2 md:-right-8 w-[30%] max-w-[230px]"
      >
        <img src={phone} alt="SCCS on iPhone: dashboard with floating tab bar" width={393} height={852} className="block w-full h-auto" />
      </motion.div>
    </div>
  );
}

/** Seconds as m:ss. */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The guided-tour film with its chapter list. Picking a chapter jumps the
 * video there and plays; while it plays, the current chapter is marked.
 */
export function TourPlayer({
  src,
  poster,
  chapters,
}: {
  src: string;
  poster: string;
  chapters: { id: string; title: string; start: number }[];
}) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(-1);
  const ref = useRef<HTMLVideoElement>(null);

  const play = (at?: number) => {
    const v = ref.current;
    if (!v) return;
    if (at !== undefined) v.currentTime = at;
    setPlaying(true);
    v.play().catch(() => setPlaying(false));
  };
  // "Watch this chapter" buttons further down the page ask the player to jump.
  useEffect(() => {
    const onJump = (e: Event) => {
      const at = (e as CustomEvent<number>).detail;
      ref.current?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      play(at);
    };
    window.addEventListener('wl-play-chapter', onJump);
    return () => window.removeEventListener('wl-play-chapter', onJump);
  });

  const onTime = () => {
    const t = ref.current?.currentTime ?? 0;
    let i = -1;
    chapters.forEach((c, j) => { if (t >= c.start) i = j; });
    setCurrent(i);
  };

  return (
    <div className="wl-tour">
      <div className="wl-film">
        <video
          ref={ref}
          poster={poster}
          controls={playing}
          playsInline
          preload="metadata"
          className="block w-full h-auto"
          data-testid="demo-video"
          onPlay={() => setPlaying(true)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={onTime}
        >
          <source src={src} type="video/mp4" />
        </video>
        {!playing && (
          <button type="button" className="wl-play" aria-label="Play the guided tour" onClick={() => play()}>
            <Play className="w-6 h-6 fill-current" aria-hidden="true" />
            <span>Play the tour</span>
          </button>
        )}
      </div>
      <nav aria-label="Tour chapters">
        <ol className="wl-chapters">
          {chapters.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className="wl-chapter"
                aria-current={i === current ? 'step' : undefined}
                onClick={() => play(c.start)}
              >
                <span className="wl-chapter-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="wl-chapter-title">{c.title}</span>
                <span className="wl-chapter-time">{clock(c.start)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

/** Jumps the tour player to a chapter and plays it. */
export function WatchChapter({ start, label }: { start: number; label: string }) {
  return (
    <button
      type="button"
      className="wl-watch"
      onClick={() => window.dispatchEvent(new CustomEvent('wl-play-chapter', { detail: start }))}
    >
      <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      {label}
      <span className="wl-muted">{clock(start)}</span>
    </button>
  );
}

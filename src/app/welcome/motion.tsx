'use client';

// Client-only motion leaves for the landing page. Every animation honours
// prefers-reduced-motion and only animates transform/opacity.
import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ReactNode, useRef, useState, useSyncExternalStore } from 'react';
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

/** Product film with a quiet custom play button; native controls once playing. */
export function DemoFilm({ src, webm, poster }: { src: string; webm?: string; poster: string }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  return (
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
      >
        {webm && <source src={webm} type="video/webm" />}
        <source src={src} type="video/mp4" />
      </video>
      {!playing && (
        <button
          type="button"
          className="wl-play"
          aria-label="Play the product film"
          onClick={() => { setPlaying(true); ref.current?.play().catch(() => setPlaying(false)); }}
        >
          <Play className="w-6 h-6 fill-current" aria-hidden="true" />
          <span>Play film</span>
        </button>
      )}
    </div>
  );
}

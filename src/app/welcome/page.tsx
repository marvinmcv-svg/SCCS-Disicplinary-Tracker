// /welcome: the product landing page and feature guide for SCCS Student OS.
//
// Built to teach: a chaptered HyperFrames tour film (marketing/demo-film),
// a "start with your role" guide, then one section per feature that says what
// it is for, who uses it and how to use it step by step, with a real screen
// and a button that plays that chapter of the film. Light and dark follow the
// system setting; motion respects reduced motion.
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, Eye, Lightbulb, UserRound } from 'lucide-react';
import { HeroDevices, MotionRoot, Reveal, TourPlayer, WatchChapter } from './motion';
import { faqs, features, permissions, roleGuides, roles, type Feature } from './features';
import './welcome.css';

export const metadata: Metadata = {
  title: 'SCCS Student OS',
  description:
    'Discipline, learning support, MTSS and positive behavior in one bilingual app for Santa Cruz Christian School. Watch the three-minute guided tour.',
  robots: { index: true, follow: true },
};

const IMG = '/welcome';
const byId = Object.fromEntries(features.map((f) => [f.id, f]));

function Shot({ shot, priority = false }: { shot: Feature['shot']; priority?: boolean }) {
  if (shot.kind === 'phone') {
    return (
      <div className="wl-phone">
        <img src={`${IMG}/${shot.src}.webp`} alt={shot.alt} width={600} height={1301} loading={priority ? 'eager' : 'lazy'} className="block h-auto w-full" />
      </div>
    );
  }
  return (
    <div className="wl-window">
      <div className="wl-window-bar" aria-hidden="true"><span /><span /><span /></div>
      <img src={`${IMG}/${shot.src}.webp`} alt={shot.alt} width={1600} height={1000} loading={priority ? 'eager' : 'lazy'} className="block h-auto w-full" />
    </div>
  );
}

/** One screen, or a desktop window with a second screen layered over it. */
function Media({ f }: { f: Feature }) {
  if (!f.extra) return <Shot shot={f.shot} />;
  const base = f.shot.kind === 'phone' ? f.extra : f.shot;
  const over = f.shot.kind === 'phone' ? f.shot : f.extra;
  return (
    <div className={`wl-stack ${over.kind === 'phone' ? 'wl-stack-phone' : 'wl-stack-desktop'}`}>
      <Shot shot={base} />
      <div className="wl-stack-over"><Shot shot={over} /></div>
    </div>
  );
}

function FeatureSection({ f, n }: { f: Feature; n: number }) {
  const flip = n % 2 === 0;
  return (
    <section id={f.id} className="wl-feature scroll-mt-20" aria-labelledby={`${f.id}-h`}>
      <div
        className={`wl-container grid items-center gap-12 py-20 md:py-28 lg:gap-14 ${
          flip ? 'lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:[&>*:first-child]:order-2' : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]'
        }`}
      >
        <Reveal>
          <p className="wl-feature-kicker">
            <span className="wl-feature-n">{String(n).padStart(2, '0')}</span>
            {f.title}
          </p>
          <h3 id={`${f.id}-h`} className="wl-h2 mt-4">{f.headline}</h3>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Who uses it">
            {f.who.map((w) => (
              <li key={w} className="wl-who"><UserRound className="h-3.5 w-3.5" aria-hidden="true" />{w}</li>
            ))}
          </ul>
          <p className="wl-lede mt-5 max-w-[52ch]">{f.purpose}</p>

          <p className="wl-howto mt-8">How to use it</p>
          <ol className="wl-steps mt-4">
            {f.steps.map((s, i) => (
              <li key={s}><span className="wl-step-n" aria-hidden="true">{i + 1}</span><span>{s}</span></li>
            ))}
          </ol>

          {f.tip && (
            <div className="wl-note mt-7">
              <Lightbulb className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p><strong>Good to know.</strong> {f.tip}</p>
            </div>
          )}
          <div className="mt-7"><WatchChapter start={f.start} label="Watch this chapter" /></div>
        </Reveal>
        <Reveal delay={0.08}><Media f={f} /></Reveal>
      </div>
    </section>
  );
}

const accessLabel: Record<string, string> = { yes: 'Yes', view: 'View only', own: 'Their own', '': 'No' };

export default function WelcomePage() {
  return (
    <MotionRoot>
    <div className="welcome">
      <a href="#tour" className="wl-skip">Skip to the tour</a>
      <header className="wl-nav">
        <div className="wl-container flex h-16 items-center justify-between gap-6">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <img src="/sccs.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[9px] object-cover" />
            <span className="text-[15px] font-semibold tracking-tight">SCCS Student OS</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Sections">
            <a href="#tour" className="wl-navlink">Tour</a>
            <a href="#roles" className="wl-navlink">By role</a>
            <a href="#features" className="wl-navlink">Features</a>
            <a href="#privacy" className="wl-navlink">Privacy</a>
            <a href="#faq" className="wl-navlink">Questions</a>
          </nav>
          <Link href="/" className="wl-btn wl-btn-primary wl-btn-sm">Sign in</Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="wl-container grid items-center gap-14 pb-24 pt-14 md:pt-20 lg:grid-cols-[minmax(0,6fr)_minmax(0,7fr)] lg:gap-12">
          <Reveal>
            <p className="wl-eyebrow">For Santa Cruz Christian School staff and families</p>
            <h1 className="wl-display mt-4">Every student, seen clearly.</h1>
            <p className="wl-lede mt-6 max-w-[38ch]">
              Discipline, learning support, MTSS and positive behavior in one calm, bilingual app. Learn all of it in a three-minute guided tour.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#tour" className="wl-btn wl-btn-primary">Watch the tour <ArrowRight className="h-4 w-4" /></a>
              <Link href="/" className="wl-btn wl-btn-ghost">Sign in</Link>
            </div>
          </Reveal>
          <HeroDevices desktop={`${IMG}/desktop-dashboard.webp`} phone={`${IMG}/mobile-dashboard.webp`} />
        </section>

        {/* Facts strip: real numbers from the shipped app */}
        <section className="wl-band" aria-label="At a glance">
          <div className="wl-container grid grid-cols-2 gap-y-8 py-12 md:grid-cols-4">
            {[
              [String(features.length), 'features, each explained step by step'],
              ['61', 'PlusPortals infraction codes built in'],
              ['6', 'learning support programs'],
              ['2', 'languages on every screen'],
            ].map(([n, label]) => (
              <div key={label}>
                <p className="wl-stat">{n}</p>
                <p className="wl-muted mt-1 max-w-[22ch] text-sm">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Guided tour */}
        <section id="tour" className="wl-container scroll-mt-20 py-24 md:py-32">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="wl-eyebrow">Guided tour</p>
            <h2 className="wl-h2 mt-3">Learn the whole app in three minutes.</h2>
            <p className="wl-lede mx-auto mt-4 max-w-[54ch]">
              {features.length} short chapters. Each one shows what a feature is for, who uses it and how to use it, step by step, on the real screens. Pick a chapter to jump straight to it.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="mt-12">
            <TourPlayer
              src={`${IMG}/sccs-tour.mp4`}
              poster={`${IMG}/sccs-tour-poster.webp`}
              chapters={features.map((f) => ({ id: f.id, title: f.title, start: f.start }))}
            />
          </Reveal>
        </section>

        {/* Start with your role */}
        <section id="roles" className="wl-band scroll-mt-16">
          <div className="wl-container py-24 md:py-28">
            <Reveal className="max-w-2xl">
              <p className="wl-eyebrow">Start here</p>
              <h2 className="wl-h2 mt-3">Start with what you do.</h2>
              <p className="wl-lede mt-4 max-w-[52ch]">Not sure where to begin? Pick your role and jump to the features you will use most.</p>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {roleGuides.map((r, i) => (
                <Reveal key={r.role} delay={i * 0.04} className="h-full">
                  <article className="wl-role h-full">
                    <h3 className="wl-h3">{r.role}</h3>
                    <ul className="mt-4 space-y-2.5">
                      {r.points.map((p) => (
                        <li key={p} className="flex gap-2 text-[15px] leading-snug"><Check className="mt-0.5 h-4 w-4 shrink-0 wl-accent" aria-hidden="true" />{p}</li>
                      ))}
                    </ul>
                    <div className="mt-5 flex flex-wrap gap-1.5">
                      {r.links.map((id) => (
                        <a key={id} href={`#${id}`} className="wl-chip">{byId[id].title}</a>
                      ))}
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Features, one section each */}
        <section id="features" className="scroll-mt-16" aria-labelledby="features-h">
          <div className="wl-container pt-24 md:pt-32">
            <Reveal className="max-w-2xl">
              <p className="wl-eyebrow">Features</p>
              <h2 id="features-h" className="wl-h2 mt-3">One workspace for the whole student.</h2>
              <p className="wl-lede mt-4 max-w-[54ch]">Everything the app can do, one feature at a time: what it is for, who uses it and how to use it.</p>
            </Reveal>
            <nav aria-label="Feature index" className="mt-10">
              <ol className="wl-index">
                {features.map((f, i) => (
                  <li key={f.id}><a href={`#${f.id}`}><span>{String(i + 1).padStart(2, '0')}</span>{f.title}</a></li>
                ))}
              </ol>
            </nav>
          </div>
          {features.map((f, i) => <FeatureSection key={f.id} f={f} n={i + 1} />)}
        </section>

        {/* Who sees what */}
        <section id="privacy" className="wl-band scroll-mt-16">
          <div className="wl-container py-24 md:py-28">
            <Reveal className="max-w-2xl">
              <p className="wl-eyebrow">Privacy</p>
              <h2 className="wl-h2 mt-3">Who sees what.</h2>
              <p className="wl-lede mt-4 max-w-[56ch]">
                Every role sees only what it needs. The app checks this on the server for every request, not just on the screen.
              </p>
            </Reveal>
            <Reveal delay={0.08} className="mt-10">
              <div className="wl-table-wrap" role="region" aria-label="Permissions by role" tabIndex={0}>
                <table className="wl-table">
                  <thead>
                    <tr>
                      <th scope="col">What</th>
                      {roles.map((r) => <th key={r} scope="col">{r}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map((p) => (
                      <tr key={p.label}>
                        <th scope="row">{p.label}</th>
                        {p.access.map((a, i) => (
                          <td key={roles[i]}>
                            {a === 'yes' ? <><Check className="mx-auto h-5 w-5 wl-yes" aria-hidden="true" /><span className="sr-only">{accessLabel.yes}</span></>
                              : a === 'view' ? <span className="wl-cell"><Eye className="h-4 w-4" aria-hidden="true" />View</span>
                              : a === 'own' ? <span className="wl-cell">Own</span>
                              : <><span className="wl-no" aria-hidden="true">&middot;</span><span className="sr-only">{accessLabel['']}</span></>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="wl-muted mt-4 text-sm">View: read only. Own: only the referrals they filed. Family: parents and students, limited to the students linked to their account.</p>
            </Reveal>
          </div>
        </section>

        {/* Questions */}
        <section id="faq" className="wl-container scroll-mt-20 py-24 md:py-32">
          <Reveal className="max-w-2xl">
            <h2 className="wl-h2">Questions, answered.</h2>
          </Reveal>
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 0.03}>
                <details className="wl-faq">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="wl-container pb-24 md:pb-32">
          <Reveal>
            <div className="wl-cta">
              <img src="/sccs.png" alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-[18px] object-cover shadow-lg" />
              <h2 className="wl-h2 mt-6">Ready when the bell rings.</h2>
              <p className="wl-lede mx-auto mt-4 max-w-[44ch]">Sign in with your SCCS account on any phone, tablet or computer.</p>
              <Link href="/" className="wl-btn wl-btn-primary mt-8">Sign in <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="wl-footer">
        <div className="wl-container flex flex-col gap-3 py-10 text-sm md:flex-row md:items-center md:justify-between">
          <p>Santa Cruz Christian School. Home of the Jaguars.</p>
          <p className="wl-muted">Student records stay private to authorized SCCS staff and linked families.</p>
        </div>
      </footer>
    </div>
    </MotionRoot>
  );
}

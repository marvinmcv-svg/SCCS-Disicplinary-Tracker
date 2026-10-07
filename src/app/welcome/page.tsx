// /welcome — product landing page for the SCCS student OS.
//
// Design read: product landing for school leaders and staff, Apple-premium
// language, system SF / Geist type, restrained Motion, real product
// screenshots and a HyperFrames-rendered film. Dials: variance 7, motion 6,
// density 3. Light and dark follow the system setting.
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Accessibility, ArrowRight, Award, BookOpenCheck, Clock3, Command, Gauge, Hand, Languages, LayoutGrid,
  MonitorSmartphone, ScanSearch, ShieldCheck, Ear,
} from 'lucide-react';
import { DemoFilm, HeroDevices, MotionRoot, Reveal } from './motion';
import './welcome.css';

export const metadata: Metadata = {
  title: 'SCCS Student OS',
  description:
    'Discipline, learning support and positive behavior in one calm, bilingual workspace for Santa Cruz Christian School.',
  robots: { index: true, follow: true },
};

const IMG = '/welcome';

const accommodationKinds = [
  { icon: BookOpenCheck, title: 'Presentation', example: 'Text-to-speech, notes provided, visual supports' },
  { icon: Hand, title: 'Response', example: 'Dictated answers, laptop for written work' },
  { icon: LayoutGrid, title: 'Setting', example: 'Small-group testing, preferential seating' },
  { icon: Clock3, title: 'Timing', example: 'Extended time, chunked assignments' },
  { icon: ShieldCheck, title: 'Behavioral', example: 'Break passes, check-in and check-out' },
  { icon: Ear, title: 'Assistive tech', example: 'Audiobooks, speech-to-text' },
];

const lessons = [
  {
    from: 'Special programs on every roster',
    to: 'IEP, 504 and ELL badges sit next to each name, and the full plan opens the moment you log an incident.',
  },
  {
    from: 'Behavior support built on PBIS',
    to: 'Recognition lives beside discipline, so the school sees its positive to corrective ratio every day.',
  },
  {
    from: 'Early warning across data',
    to: 'Insights blends incidents, suspensions, MTSS tiers and recognition into a score that always shows its reasons.',
  },
  {
    from: 'Fewer screens to click through',
    to: 'One search box finds any student or screen, and the most common actions are one tap from the dashboard.',
  },
];

export default function WelcomePage() {
  return (
    <MotionRoot>
    <div className="welcome">
      <header className="wl-nav">
        <div className="wl-container flex h-16 items-center justify-between gap-6">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <img src="/sccs.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[9px] object-cover" />
            <span className="text-[15px] font-semibold tracking-tight">SCCS Student OS</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Sections">
            <a href="#film" className="wl-navlink">Film</a>
            <a href="#features" className="wl-navlink">Features</a>
            <a href="#support" className="wl-navlink">Learning support</a>
          </nav>
          <Link href="/" className="wl-btn wl-btn-primary wl-btn-sm">Sign in</Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="wl-container grid items-center gap-14 pb-24 pt-14 md:pt-20 lg:grid-cols-[minmax(0,6fr)_minmax(0,7fr)] lg:gap-12">
          <Reveal>
            <h1 className="wl-display">Every student, seen clearly.</h1>
            <p className="wl-lede mt-6 max-w-[34ch]">
              Discipline, learning support and positive behavior in one calm, bilingual workspace for SCCS staff.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/" className="wl-btn wl-btn-primary">Sign in <ArrowRight className="h-4 w-4" /></Link>
              <a href="#film" className="wl-btn wl-btn-ghost">Watch the film</a>
            </div>
          </Reveal>
          <HeroDevices desktop={`${IMG}/desktop-dashboard.webp`} phone={`${IMG}/mobile-dashboard.webp`} />
        </section>

        {/* Facts strip: real numbers from the shipped app */}
        <section className="wl-band" aria-label="At a glance">
          <div className="wl-container grid grid-cols-2 gap-y-8 py-12 md:grid-cols-4">
            {[
              ['61', 'PlusPortals infraction codes'],
              ['6', 'learning support programs'],
              ['2', 'languages on every screen'],
              ['0', 'apps to install'],
            ].map(([n, label]) => (
              <div key={label}>
                <p className="wl-stat">{n}</p>
                <p className="wl-muted mt-1 text-sm">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Film */}
        <section id="film" className="wl-container scroll-mt-20 py-24 md:py-32">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="wl-h2">A school day, in under a minute.</h2>
            <p className="wl-lede mx-auto mt-4 max-w-[52ch]">
              From the morning dashboard to a calm, compliant referral for a student with an IEP.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="mt-12">
            <DemoFilm src={`${IMG}/sccs-demo.mp4`} webm={`${IMG}/sccs-demo.webm`} poster={`${IMG}/sccs-demo-poster.webp`} />
          </Reveal>
        </section>

        {/* Bento */}
        <section id="features" className="wl-container scroll-mt-20 pb-24 md:pb-32">
          <Reveal className="max-w-2xl">
            <p className="wl-eyebrow">Features</p>
            <h2 className="wl-h2 mt-3">One workspace for the whole student.</h2>
          </Reveal>

          <div className="mt-12 grid gap-4 md:grid-cols-6">
            <Reveal className="md:col-span-4">
              <article className="wl-tile wl-tile-image h-full">
                <div className="p-7 pb-0 md:p-9 md:pb-0">
                  <h3 className="wl-h3">Referrals that match the SIS.</h3>
                  <p className="wl-muted mt-2 max-w-[44ch]">
                    Log incidents with the same PlusPortals codes the office uses. Penalties fill in detention and suspension days for you.
                  </p>
                </div>
                <img src={`${IMG}/desktop-incidents.webp`} alt="Incidents list with status badges and SIS codes" loading="lazy" className="wl-tile-shot" />
              </article>
            </Reveal>
            <Reveal className="md:col-span-2" delay={0.05}>
              <article className="wl-tile wl-tile-green flex h-full flex-col">
                <div className="p-7">
                  <Award className="h-7 w-7" aria-hidden="true" />
                  <h3 className="wl-h3 mt-4">Recognition in two taps.</h3>
                  <p className="wl-muted mt-2">Catch good choices as they happen and keep the PBIS ratio in view.</p>
                </div>
                <img src={`${IMG}/mobile-recognition.webp`} alt="Recognize a student sheet on iPhone" loading="lazy" className="mx-auto mt-auto w-[68%] translate-y-6 rounded-t-[28px] shadow-2xl" />
              </article>
            </Reveal>
            <Reveal className="md:col-span-3">
              <article className="wl-tile wl-tile-image h-full">
                <div className="p-7 pb-0 md:p-9 md:pb-0">
                  <Gauge className="h-7 w-7 wl-accent" aria-hidden="true" />
                  <h3 className="wl-h3 mt-4">Early warning you can explain.</h3>
                  <p className="wl-muted mt-2 max-w-[42ch]">Every risk score lists the reasons behind it. Recognition lowers it.</p>
                </div>
                <img src={`${IMG}/desktop-insights.webp`} alt="Insights page with risk levels and manifestation determination alerts" loading="lazy" className="wl-tile-shot" />
              </article>
            </Reveal>
            <Reveal className="md:col-span-3" delay={0.05}>
              <article className="wl-tile wl-tile-image h-full">
                <div className="p-7 pb-0 md:p-9 md:pb-0">
                  <Command className="h-7 w-7 wl-accent" aria-hidden="true" />
                  <h3 className="wl-h3 mt-4">Find anyone with Ctrl K.</h3>
                  <p className="wl-muted mt-2 max-w-[42ch]">Students, screens and actions from one search box, anywhere in the app.</p>
                </div>
                <img src={`${IMG}/desktop-palette.webp`} alt="Command palette searching for a student" loading="lazy" className="wl-tile-shot" />
              </article>
            </Reveal>
            <Reveal className="md:col-span-6">
              <article className="wl-tile wl-tile-blue grid items-center gap-8 p-7 md:grid-cols-[1fr_auto] md:p-10">
                <div>
                  <div className="flex items-center gap-3">
                    <Languages className="h-7 w-7" aria-hidden="true" />
                    <MonitorSmartphone className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <h3 className="wl-h3 mt-4">English and Spanish. Phone and desktop.</h3>
                  <p className="mt-2 max-w-[56ch] opacity-80">
                    Switch languages with one tap. Add it to any home screen and it opens like a native app, with saved and biometric sign-in.
                  </p>
                </div>
                <p className="wl-bilingual" aria-hidden="true">EN<span>/</span>ES</p>
              </article>
            </Reveal>
          </div>
        </section>

        {/* Learning support */}
        <section id="support" className="wl-band scroll-mt-16">
          <div className="wl-container grid items-center gap-14 py-24 md:py-32 lg:grid-cols-2">
            <Reveal>
              <p className="wl-eyebrow">Learning support</p>
              <h2 className="wl-h2 mt-3">Accommodations travel with the student.</h2>
              <p className="wl-lede mt-5 max-w-[48ch]">
                IEP, 504, ELL, behavior, gifted and health plans live on the student record. Teachers see what matters before they act.
              </p>
              <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {accommodationKinds.map(({ icon: Icon, title, example }) => (
                  <div key={title} className="wl-acc">
                    <Icon className="h-5 w-5 wl-accent" aria-hidden="true" />
                    <p className="mt-3 text-[15px] font-semibold">{title}</p>
                    <p className="wl-muted mt-1 text-[13px] leading-snug">{example}</p>
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="wl-window">
                <div className="wl-window-bar" aria-hidden="true"><span /><span /><span /></div>
                <img
                  src={`${IMG}/desktop-incident-alert.webp`}
                  alt="New incident form showing the student's plan, behavior considerations and a manifestation determination warning"
                  loading="lazy"
                  className="block h-auto w-full"
                />
              </div>
              <div className="wl-note mt-6">
                <Accessibility className="h-5 w-5 shrink-0" aria-hidden="true" />
                <p>
                  <strong>Built-in IDEA safeguard.</strong> For students with an IEP or 504 plan, the app warns at 8 days of removal and flags
                  day 10, so the team can hold a manifestation determination review in time.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* What we learned from the big SIS platforms */}
        <section className="wl-container py-24 md:py-32">
          <Reveal className="max-w-2xl">
            <h2 className="wl-h2">The best of a big SIS. Without the maze.</h2>
            <p className="wl-lede mt-4 max-w-[54ch]">
              We studied what schools value most in the large student information systems, and what they wish were simpler.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {lessons.map((l, i) => (
              <Reveal key={l.from} delay={i * 0.05}>
                <div className="wl-lesson">
                  <ScanSearch className="h-5 w-5 wl-accent" aria-hidden="true" />
                  <h3 className="mt-3 text-lg font-semibold tracking-tight">{l.from}</h3>
                  <p className="wl-muted mt-2 leading-relaxed">{l.to}</p>
                </div>
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
          <p className="wl-muted">Student records stay private to authorized SCCS staff.</p>
        </div>
      </footer>
    </div>
    </MotionRoot>
  );
}

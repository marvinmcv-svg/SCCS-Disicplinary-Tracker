// Shown inside the incident form once a student is chosen: if the student has
// an IEP / 504 / BIP (etc.), staff see the behaviour considerations and key
// accommodations BEFORE choosing a consequence, plus an IDEA manifestation-
// determination warning when removals near 10 days.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Accessibility, AlertOctagon } from 'lucide-react';
import api from '../lib/api';
import { useI18n } from '../i18n';
import { PlanBadge } from './kit';
import type { SupportPlan } from '../pages/LearningSupport';

export interface StudentSupport {
  plans: SupportPlan[];
  active_plan_types: string[];
  removal_days_ytd: number;
  iss_days_ytd: number;
  mdr: { threshold: number; warning_at: number; status: 'ok' | 'approaching' | 'required' } | null;
  recognitions: { id: number; category: string; points: number; note: string | null; awarded_by: string | null; date: string }[];
  recognition_points: number;
}

/** `version` changes force a reload (the profile bumps it on live refresh). */
export function useStudentSupport(studentId: number | string | null | undefined, version = 0) {
  const [data, setData] = useState<StudentSupport | null>(null);
  useEffect(() => {
    const id = Number(studentId);
    if (!id) { setData(null); return; }
    let cancelled = false;
    api.get<StudentSupport>(`/students/${id}/support`)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [studentId, version]);
  return data;
}

export default function SupportAlert({ studentId }: { studentId: number | string | null | undefined }) {
  const { t } = useI18n();
  const support = useStudentSupport(studentId);
  if (!support) return null;
  const current = support.plans.filter((p) => p.status === 'Active' || p.status === 'Under Review');
  if (!current.length) return null;

  const considerations = current.map((p) => p.behavior_considerations).filter(Boolean) as string[];
  const accommodations = current.flatMap((p) => p.accommodations).filter((a) => a.active !== false);
  const behavioral = accommodations.filter((a) => a.category === 'Behavioral');
  const highlight = (behavioral.length ? behavioral : accommodations).slice(0, 3);

  return (
    <div className="space-y-3" data-testid="support-alert">
      <div className="callout callout-purple">
        <Accessibility className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <strong>{t('This student has a learning support plan')}</strong>
            {support.active_plan_types.map((type) => <PlanBadge key={type} type={type} />)}
          </div>
          {considerations.map((c) => <p key={c} className="text-sm mt-1">{c}</p>)}
          {highlight.length > 0 && (
            <ul className="text-sm mt-2 list-disc pl-5 space-y-0.5">
              {highlight.map((a, i) => <li key={a.id ?? i}>{a.description}</li>)}
            </ul>
          )}
          <Link to={`/support?student=${current[0].student_id}`} className="text-sm font-medium underline underline-offset-2 mt-2 inline-block">
            {t('View full plan')}
          </Link>
        </div>
      </div>
      {support.mdr && support.mdr.status !== 'ok' && (
        <div className="callout callout-danger" data-testid="mdr-warning">
          <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <strong>
              {support.mdr.status === 'required'
                ? t('Manifestation determination review required')
                : t('Approaching the 10-day removal limit')}
            </strong>
            <p className="text-sm mt-0.5">
              {t('{days} days of out-of-school suspension this school year. Under IDEA, removals beyond {limit} days need a manifestation determination review with the IEP/504 team.', {
                days: support.removal_days_ytd,
                limit: support.mdr.threshold,
              })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

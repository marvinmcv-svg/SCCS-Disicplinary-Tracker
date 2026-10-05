// Insights — explainable early-warning scores and IDEA manifestation-
// determination alerts. Every score lists the factors that produced it.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertOctagon, ChevronRight, Gauge, Scale, ShieldAlert, Sparkles } from 'lucide-react';
import api from '../lib/api';
import { useI18n } from '../i18n';
import { EmptyState, PageHeader, PlanBadge, Segmented, Skeleton, StudentAvatar } from '../components/kit';

interface Factor { label: string; points: number }
interface RiskStudent {
  id: number;
  student_id: string;
  first_name: string;
  last_name: string;
  grade: number;
  section: string | null;
  profile_picture: string | null;
  total_points: number;
  incidents_30d: number;
  oss_days_ytd: number;
  mtss_tier: number | null;
  recognitions_30d: number;
  plan_types: string[];
  score: number;
  level: 'High' | 'Moderate' | 'Low';
  factors: Factor[];
  mdr: { oss_days: number; threshold: number; required: boolean } | null;
}
export interface EarlyWarning {
  summary: {
    high: number; moderate: number; low: number; students: number; with_plans: number;
    mdr_alerts: number; incidents_30d: number; recognitions_30d: number; positive_ratio: number | null;
  };
  students: RiskStudent[];
  mdr_alerts: RiskStudent[];
}

// Translate the server's factor sentences without losing their numbers.
function useFactorLabel() {
  const { t } = useI18n();
  return (label: string) => {
    const rules: [RegExp, string][] = [
      [/^(\d+) incidents? in the last 30 days$/, '{n} incidents in the last 30 days'],
      [/^(\d+) high-severity incidents? this year$/, '{n} high-severity incidents this year'],
      [/^(\d+) suspension days? this year$/, '{n} suspension days this year'],
      [/^Conduct points at (\d+)$/, 'Conduct points at {n}'],
      [/^MTSS Tier (\d+) intervention$/, 'MTSS Tier {n} intervention'],
      [/^(\d+) positive recognitions? \(protective\)$/, '{n} positive recognitions (protective)'],
    ];
    for (const [re, key] of rules) {
      const m = re.exec(label);
      if (m) return t(key, { n: m[1] });
    }
    return t(label);
  };
}

export default function Insights() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const factorLabel = useFactorLabel();
  const [data, setData] = useState<EarlyWarning | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [level, setLevel] = useState<'High' | 'Moderate' | 'all'>('High');

  useEffect(() => {
    api.get<EarlyWarning>('/insights/early-warning?limit=120')
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.error || t('Could not load insights')))
      .finally(() => setLoading(false));
  }, [t]);

  const list = (data?.students ?? []).filter((s) => level === 'all' || s.level === level);
  const s = data?.summary;

  return (
    <div className="animate-fade-in pb-24 md:pb-8 max-w-6xl mx-auto">
      <PageHeader
        title={t('Insights')}
        subtitle={t('Early warning signals from behavior, suspensions, interventions and recognition.')}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <button type="button" className="metric metric-red text-left" onClick={() => setLevel('High')}>
          <span className="metric-label"><Gauge className="w-4 h-4" /> {t('High risk')}</span>
          <span className="metric-value" data-testid="insights-high">{loading ? '-' : s?.high}</span>
          <span className="metric-foot">{t('of {n} students', { n: s?.students ?? 0 })}</span>
        </button>
        <button type="button" className="metric metric-orange text-left" onClick={() => setLevel('Moderate')}>
          <span className="metric-label"><Activity className="w-4 h-4" /> {t('Moderate risk')}</span>
          <span className="metric-value">{loading ? '-' : s?.moderate}</span>
          <span className="metric-foot">{t('Watch list')}</span>
        </button>
        <div className="metric metric-purple">
          <span className="metric-label"><Scale className="w-4 h-4" /> {t('MDR alerts')}</span>
          <span className="metric-value">{loading ? '-' : s?.mdr_alerts}</span>
          <span className="metric-foot">{t('IEP/504 near 10 removal days')}</span>
        </div>
        <div className="metric metric-green">
          <span className="metric-label"><Sparkles className="w-4 h-4" /> {t('Positive to corrective')}</span>
          <span className="metric-value">{s?.positive_ratio != null ? `${s.positive_ratio} : 1` : '-'}</span>
          <span className="metric-foot">{t('Last 30 days')}</span>
        </div>
      </div>

      {error && <div className="callout callout-danger mb-4">{error}</div>}

      {!!data?.mdr_alerts.length && (
        <section className="card mb-6 border-l-4 border-l-red-500" data-testid="mdr-alerts">
          <div className="flex items-start gap-3 mb-4">
            <AlertOctagon className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <h2 className="section-title">{t('Manifestation determination')}</h2>
              <p className="text-sm text-gray-500">
                {t('Students with an IEP or 504 plan approaching or past 10 days of removal this school year. IDEA requires a review before further removals.')}
              </p>
            </div>
          </div>
          <ul className="grid md:grid-cols-2 gap-3">
            {data.mdr_alerts.map((m) => (
              <li key={m.id}>
                <button type="button" className="mdr-row" onClick={() => navigate(`/students/${m.id}`)}>
                  <StudentAvatar first={m.first_name} last={m.last_name} grade={m.grade} picture={m.profile_picture} size={36} />
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block font-semibold text-gray-900 truncate">{m.first_name} {m.last_name}</span>
                    <span className="flex gap-1 mt-0.5">{m.plan_types.map((p) => <PlanBadge key={p} type={p} />)}</span>
                  </span>
                  <span className="text-right">
                    <span className={`block text-lg font-semibold tabular-nums ${m.mdr!.required ? 'text-red-600' : 'text-orange-600'}`}>{m.mdr!.oss_days}/{m.mdr!.threshold}</span>
                    <span className="block text-xs text-gray-500">{m.mdr!.required ? t('Review required') : t('Approaching')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="section-title">{t('Students to watch')}</h2>
          <Segmented
            label={t('Risk level')}
            value={level}
            onChange={setLevel}
            options={[{ value: 'High', label: t('High') }, { value: 'Moderate', label: t('Moderate') }, { value: 'all', label: t('All') }]}
          />
        </div>
        {loading ? (
          <div className="p-4 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : list.length === 0 ? (
          <EmptyState icon={<ShieldAlert className="w-6 h-6" />} title={t('No students at this level')} body={t('That is good news. Check the other levels.')} />
        ) : (
          <ul className="list-inset" data-testid="risk-list">
            {list.map((st) => (
              <li key={st.id}>
                <button type="button" className="list-row items-start" onClick={() => navigate(`/students/${st.id}`)}>
                  <StudentAvatar first={st.first_name} last={st.last_name} grade={st.grade} picture={st.profile_picture} />
                  <span className="flex-1 min-w-0 text-left">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{st.last_name}, {st.first_name}</span>
                      <span className="text-sm text-gray-500">{t('Grade')} {st.grade}{st.section ? `-${st.section}` : ''}</span>
                      {st.plan_types.map((p) => <PlanBadge key={p} type={p} />)}
                    </span>
                    <span className="flex flex-wrap gap-1.5 mt-2">
                      {st.factors.slice(0, 4).map((f) => (
                        <span key={f.label} className={`factor-chip ${f.points < 0 ? 'is-protective' : ''}`}>
                          {factorLabel(f.label)}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className={`score-pill score-${st.level.toLowerCase()}`} aria-label={t('Risk score {n}', { n: st.score })}>
                    {st.score}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 self-center" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-gray-500 mt-4 max-w-2xl">
        {t('Scores are rules-based and fully explainable: recent incidents, severity, suspension days, conduct points and MTSS tier add risk; recognitions reduce it. Use them to start a conversation, never as a label.')}
      </p>
    </div>
  );
}

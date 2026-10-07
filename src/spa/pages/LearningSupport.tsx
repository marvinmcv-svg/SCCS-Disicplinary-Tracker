// Learning Support — IEP / 504 / ELL / BIP / Gifted / Health plans and the
// accommodations every staff member must honour. Teachers get a read-only
// view; case managers (admin, principal, counselor) can create and edit.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Accessibility, CalendarClock, ChevronRight, HeartHandshake, Pencil, Plus, Search, ShieldAlert, Trash2, UserRound,
} from 'lucide-react';
import api from '../lib/api';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { useAuth } from '../App';
import { useI18n } from '../i18n';
import {
  EmptyState, PageHeader, PlanBadge, Segmented, Sheet, Skeleton, StudentAvatar, formatShortDate, todayISO,
} from '../components/kit';

export interface Accommodation {
  id?: number;
  category: string;
  description: string;
  applies_to?: string;
  active?: boolean;
}

export interface SupportPlan {
  id: number;
  student_id: number;
  plan_type: string;
  primary_need: string | null;
  case_manager: string | null;
  start_date: string;
  review_date: string | null;
  status: string;
  behavior_considerations: string | null;
  parent_consent: boolean;
  notes: string | null;
  first_name: string;
  last_name: string;
  student_code: string;
  grade: number | null;
  section: string | null;
  profile_picture: string | null;
  accommodations: Accommodation[];
}

interface StudentLite { id: number; student_id: string; first_name: string; last_name: string; grade: number; section?: string }

export const PLAN_TYPES = ['IEP', '504', 'ELL', 'BIP', 'Gifted', 'Health'] as const;
export const PLAN_LABELS: Record<string, string> = {
  IEP: 'Individualized Education Program',
  '504': 'Section 504 Plan',
  ELL: 'English Language Learner',
  BIP: 'Behavior Intervention Plan',
  Gifted: 'Gifted & Talented',
  Health: 'Health Plan',
};
const CATEGORIES = ['Presentation', 'Response', 'Setting', 'Timing', 'Behavioral', 'Assistive Technology'] as const;
const STATUSES = ['Active', 'Under Review', 'Expired', 'Closed'] as const;

/** One-tap suggestions per plan type so case managers rarely type from scratch. */
const SUGGESTIONS: Record<string, [string, string][]> = {
  IEP: [['Timing', 'Extended time (1.5x) on tests and quizzes'], ['Presentation', 'Text-to-speech for reading passages'], ['Setting', 'Testing in a small-group, reduced-distraction room'], ['Behavioral', 'Break pass: up to two 5-minute breaks per class']],
  '504': [['Timing', 'Extended time (1.5x) on tests'], ['Behavioral', 'Movement breaks and fidget tools allowed'], ['Presentation', 'Copy of class notes provided']],
  ELL: [['Presentation', 'Bilingual glossary allowed on assessments'], ['Presentation', 'Visual supports and sentence frames']],
  BIP: [['Behavioral', 'Check-in / check-out with counselor daily'], ['Behavioral', 'Calm-down space available with adult supervision']],
  Gifted: [['Presentation', 'Compacted curriculum and enrichment extensions']],
  Health: [['Setting', 'Emergency medication kept in classroom and nurse office']],
};

const daysUntil = (d: string | null) => (d ? Math.round((new Date(`${d}T12:00:00`).getTime() - Date.now()) / 86_400_000) : null);

export default function LearningSupport() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canManage = ['admin', 'coordinator', 'principal', 'counselor'].includes(user?.role);

  const [plans, setPlans] = useState<SupportPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'current' | 'review' | 'all'>('current');
  const typeFilter = params.get('type') || 'all';
  const [selected, setSelected] = useState<SupportPlan | null>(null);
  const [editing, setEditing] = useState<Partial<SupportPlan> | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await api.get<SupportPlan[]>('/support-plans');
      setPlans(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || t('Could not load learning support plans'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useLiveRefresh(() => load());
  useEffect(() => { load(); }, [load]);

  // Deep link: #/support?student=ID opens that student's first plan.
  useEffect(() => {
    const sid = Number(params.get('student'));
    if (sid && plans.length) {
      const p = plans.find((x) => x.student_id === sid);
      if (p) setSelected(p);
    }
  }, [params, plans]);

  const current = plans.filter((p) => p.status === 'Active' || p.status === 'Under Review');
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of current) c[p.plan_type] = (c[p.plan_type] ?? 0) + 1;
    return c;
  }, [current]);
  const reviewSoon = current.filter((p) => { const d = daysUntil(p.review_date); return d !== null && d <= 30; });

  const filtered = plans.filter((p) => {
    if (statusFilter === 'current' && !(p.status === 'Active' || p.status === 'Under Review')) return false;
    if (statusFilter === 'review' && !reviewSoon.includes(p)) return false;
    if (typeFilter !== 'all' && p.plan_type !== typeFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      return `${p.first_name} ${p.last_name} ${p.student_code} ${p.primary_need ?? ''} ${p.case_manager ?? ''}`.toLowerCase().includes(q);
    }
    return true;
  });

  const setType = (type: string) => {
    const next = new URLSearchParams(params);
    if (type === 'all' || type === typeFilter) next.delete('type'); else next.set('type', type);
    setParams(next, { replace: true });
  };

  const removePlan = async (plan: SupportPlan) => {
    if (!window.confirm(t('Delete this {type} plan for {name}?', { type: plan.plan_type, name: `${plan.first_name} ${plan.last_name}` }))) return;
    await api.delete(`/support-plans/${plan.id}`);
    setSelected(null);
    load();
  };

  return (
    <div className="animate-fade-in pb-24 md:pb-8 max-w-6xl mx-auto">
      <PageHeader
        title={t('Learning Support')}
        subtitle={t('Plans and accommodations for students with learning differences, in one place.')}
        actions={canManage && (
          <button className="btn btn-primary" onClick={() => setEditing({ plan_type: 'IEP', status: 'Active', start_date: todayISO(), accommodations: [] })}>
            <Plus className="w-4 h-4" /> {t('New Plan')}
          </button>
        )}
      />

      {/* Program tiles double as filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" data-testid="plan-type-tiles">
        {PLAN_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setType(type)}
            aria-pressed={typeFilter === type}
            className={`program-tile program-${type.toLowerCase()} ${typeFilter === type ? 'is-active' : ''}`}
          >
            <span className="program-tile-count">{loading ? '-' : counts[type] ?? 0}</span>
            <span className="program-tile-label">{type}</span>
            <span className="program-tile-sub">{t(PLAN_LABELS[type])}</span>
          </button>
        ))}
      </div>

      {reviewSoon.length > 0 && (
        <button
          type="button"
          onClick={() => setStatusFilter('review')}
          className="callout callout-warning w-full text-left mb-6"
        >
          <CalendarClock className="w-5 h-5 shrink-0" />
          <span className="flex-1">
            <strong>{t('{n} plans due for annual review within 30 days', { n: reviewSoon.length })}</strong>
            <span className="block text-sm opacity-80">{t('Schedule meetings with families and case managers.')}</span>
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      <div className="flex flex-col md:flex-row gap-3 md:items-center mb-4">
        <div className="search-field flex-1">
          <Search className="w-4 h-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Search students, needs or case managers')}
            aria-label={t('Search students, needs or case managers')}
          />
        </div>
        <Segmented
          label={t('Plan status')}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'current', label: t('Current') },
            { value: 'review', label: t('Review due') },
            { value: 'all', label: t('All') },
          ]}
        />
      </div>

      {error && <div className="callout callout-danger mb-4">{error}</div>}

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Accessibility className="w-6 h-6" />}
            title={t('No plans match these filters')}
            body={t('Try another program or clear the search.')}
          />
        ) : (
          <ul className="list-inset" data-testid="support-plan-list">
            {filtered.map((p) => {
              const due = daysUntil(p.review_date);
              return (
                <li key={p.id}>
                  <button type="button" className="list-row" onClick={() => setSelected(p)}>
                    <StudentAvatar first={p.first_name} last={p.last_name} grade={p.grade} picture={p.profile_picture} />
                    <span className="flex-1 min-w-0 text-left">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 break-words">{p.last_name}, {p.first_name}</span>
                        <PlanBadge type={p.plan_type} />
                        {p.status !== 'Active' && <span className="badge badge-warning">{t(p.status)}</span>}
                      </span>
                      <span className="block text-sm text-gray-500 line-clamp-2">
                        {p.primary_need ?? t(PLAN_LABELS[p.plan_type])}
                      </span>
                    </span>
                    <span className="hidden sm:flex flex-col items-end text-right shrink-0">
                      <span className="text-sm text-gray-900">{t('{n} accommodations', { n: p.accommodations.length })}</span>
                      <span className={`text-xs ${due !== null && due <= 30 ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                        {t('Review')} {formatShortDate(p.review_date, lang)}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Plan detail */}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.first_name} ${selected.last_name}` : ''}
        wide
        testId="support-plan-detail"
        footer={selected && (
          <>
            <button className="btn btn-secondary flex-1" onClick={() => navigate(`/students/${selected.student_id}`)}>
              <UserRound className="w-4 h-4" /> {t('Student profile')}
            </button>
            {canManage && (
              <button className="btn btn-primary flex-1" onClick={() => { setEditing(selected); setSelected(null); }}>
                <Pencil className="w-4 h-4" /> {t('Edit plan')}
              </button>
            )}
          </>
        )}
      >
        {selected && <PlanDetail plan={selected} canManage={canManage} onDelete={() => removePlan(selected)} />}
      </Sheet>

      {editing && (
        <PlanEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

export function AccommodationGroups({ items }: { items: Accommodation[] }) {
  const { t } = useI18n();
  const groups = CATEGORIES.map((c) => ({ c, list: items.filter((a) => a.category === c && a.active !== false) })).filter((g) => g.list.length);
  if (!groups.length) return <p className="text-sm text-gray-500">{t('No accommodations listed.')}</p>;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {groups.map(({ c, list }) => (
        <div key={c} className="rounded-2xl bg-gray-50 p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">{t(c)}</p>
          <ul className="space-y-2">
            {list.map((a, i) => (
              <li key={a.id ?? i} className="text-sm text-gray-900 leading-snug">
                {a.description}
                {a.applies_to && a.applies_to !== 'All classes' && (
                  <span className="text-gray-500"> ({t(a.applies_to)})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PlanDetail({ plan, canManage, onDelete }: { plan: SupportPlan; canManage: boolean; onDelete: () => void }) {
  const { t, lang } = useI18n();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <StudentAvatar first={plan.first_name} last={plan.last_name} grade={plan.grade} picture={plan.profile_picture} size={52} />
        <div>
          <div className="flex items-center gap-2"><PlanBadge type={plan.plan_type} /><span className="text-sm text-gray-500">{t(plan.status)}</span></div>
          <p className="text-sm text-gray-500 mt-1">
            {plan.student_code} · {t('Grade')} {plan.grade}{plan.section ? `-${plan.section}` : ''}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-gray-500">{t('Primary need')}</dt><dd className="font-medium text-gray-900">{plan.primary_need ?? '-'}</dd></div>
        <div><dt className="text-gray-500">{t('Case manager')}</dt><dd className="font-medium text-gray-900">{plan.case_manager ?? '-'}</dd></div>
        <div><dt className="text-gray-500">{t('Start Date')}</dt><dd className="font-medium text-gray-900">{formatShortDate(plan.start_date, lang)}</dd></div>
        <div><dt className="text-gray-500">{t('Annual review')}</dt><dd className="font-medium text-gray-900">{formatShortDate(plan.review_date, lang)}</dd></div>
      </dl>

      {plan.behavior_considerations && (
        <div className="callout callout-info">
          <HeartHandshake className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold">{t('Before any discipline')}</p>
            <p className="text-sm mt-0.5">{plan.behavior_considerations}</p>
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-gray-900 mb-3">{t('Accommodations')}</h3>
        <AccommodationGroups items={plan.accommodations} />
      </div>

      {plan.notes && <p className="text-sm text-gray-600">{plan.notes}</p>}

      {canManage && (
        <button type="button" onClick={onDelete} className="text-sm text-red-600 font-medium inline-flex items-center gap-1.5">
          <Trash2 className="w-4 h-4" /> {t('Delete plan')}
        </button>
      )}
    </div>
  );
}

function PlanEditor({ initial, onClose, onSaved }: { initial: Partial<SupportPlan>; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<Partial<SupportPlan>>(initial);
  const [accs, setAccs] = useState<Accommodation[]>(initial.accommodations ?? []);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [studentQuery, setStudentQuery] = useState(initial.first_name ? `${initial.last_name}, ${initial.first_name}` : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<StudentLite[]>('/students').then((r) => setStudents(r.data)).catch(() => undefined);
  }, []);

  const matches = studentQuery.length >= 2 && !form.student_id
    ? students.filter((s) => `${s.last_name}, ${s.first_name} ${s.student_id}`.toLowerCase().includes(studentQuery.toLowerCase())).slice(0, 6)
    : [];

  const set = <K extends keyof SupportPlan>(k: K, v: SupportPlan[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setError('');
    if (!form.student_id) { setError(t('Choose a student')); return; }
    setSaving(true);
    try {
      const payload = {
        student_id: form.student_id,
        plan_type: form.plan_type,
        primary_need: form.primary_need ?? '',
        case_manager: form.case_manager ?? '',
        start_date: form.start_date,
        review_date: form.review_date ?? '',
        status: form.status,
        behavior_considerations: form.behavior_considerations ?? '',
        notes: form.notes ?? '',
        accommodations: accs.filter((a) => a.description.trim()).map((a) => ({
          category: a.category, description: a.description.trim(), applies_to: a.applies_to || 'All classes', active: a.active !== false,
        })),
      };
      if (form.id) await api.put(`/support-plans/${form.id}`, payload);
      else await api.post('/support-plans', payload);
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error || t('Could not save the plan'));
    } finally {
      setSaving(false);
    }
  };

  const suggestions = (SUGGESTIONS[form.plan_type ?? 'IEP'] ?? []).filter(([, d]) => !accs.some((a) => a.description === d));

  return (
    <Sheet
      open
      onClose={onClose}
      title={form.id ? t('Edit plan') : t('New Plan')}
      wide
      testId="support-plan-editor"
      footer={(
        <>
          <button className="btn btn-secondary flex-1" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn btn-primary flex-1" onClick={save} disabled={saving}>{saving ? t('Saving...') : t('Save plan')}</button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="form-group relative">
          <label className="form-label" htmlFor="plan-student">{t('Student')}</label>
          <input
            id="plan-student"
            className="input"
            value={studentQuery}
            onChange={(e) => { setStudentQuery(e.target.value); set('student_id', undefined as any); }}
            placeholder={t('Type a name or student ID')}
            autoComplete="off"
          />
          {matches.length > 0 && (
            <ul className="popover-list" role="listbox">
              {matches.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => { set('student_id', s.id); setStudentQuery(`${s.last_name}, ${s.first_name}`); }}
                  >
                    {s.last_name}, {s.first_name} <span className="text-gray-500">· {s.student_id} · {t('Grade')} {s.grade}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <span className="form-label">{t('Program')}</span>
          <div className="flex flex-wrap gap-2">
            {PLAN_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={form.plan_type === type}
                onClick={() => set('plan_type', type)}
                className={`chip-toggle ${form.plan_type === type ? 'is-active' : ''}`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-4">
          <div className="form-group">
            <label className="form-label" htmlFor="plan-need">{t('Primary need')}</label>
            <input id="plan-need" className="input" value={form.primary_need ?? ''} onChange={(e) => set('primary_need', e.target.value)} placeholder={t('e.g. Specific Learning Disability (Dyslexia)')} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="plan-cm">{t('Case manager')}</label>
            <input id="plan-cm" className="input" value={form.case_manager ?? ''} onChange={(e) => set('case_manager', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="plan-start">{t('Start Date')}</label>
            <input id="plan-start" type="date" className="input" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="plan-review">{t('Annual review')}</label>
            <input id="plan-review" type="date" className="input" value={form.review_date ?? ''} onChange={(e) => set('review_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="plan-status">{t('Status')}</label>
            <select id="plan-status" className="select" value={form.status ?? 'Active'} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="plan-behavior">{t('Behavior considerations (shown when an incident is logged)')}</label>
          <textarea
            id="plan-behavior"
            className="input min-h-[88px]"
            value={form.behavior_considerations ?? ''}
            onChange={(e) => set('behavior_considerations', e.target.value)}
            placeholder={t('e.g. Responds best to private redirection. Offer a break before escalating.')}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="form-label mb-0">{t('Accommodations')}</span>
            <button
              type="button"
              className="text-sm font-medium text-blue-600 inline-flex items-center gap-1"
              onClick={() => setAccs((a) => [...a, { category: 'Presentation', description: '', applies_to: 'All classes' }])}
            >
              <Plus className="w-4 h-4" /> {t('Add')}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {suggestions.map(([category, description]) => (
                <button
                  key={description}
                  type="button"
                  className="chip-suggest"
                  onClick={() => setAccs((a) => [...a, { category, description, applies_to: 'All classes' }])}
                >
                  <Plus className="w-3.5 h-3.5" /> {description}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2" data-testid="accommodation-rows">
            {accs.map((a, i) => (
              <div key={i} className="flex gap-2 items-start">
                <select
                  aria-label={t('Category')}
                  className="select w-40 shrink-0"
                  value={a.category}
                  onChange={(e) => setAccs((list) => list.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
                </select>
                <input
                  aria-label={t('Accommodation')}
                  className="input flex-1"
                  value={a.description}
                  onChange={(e) => setAccs((list) => list.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                />
                <button type="button" className="icon-btn mt-2" aria-label={t('Remove')} onClick={() => setAccs((list) => list.filter((_, j) => j !== i))}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <div className="callout callout-danger"><ShieldAlert className="w-5 h-5 shrink-0" />{error}</div>}
      </div>
    </Sheet>
  );
}

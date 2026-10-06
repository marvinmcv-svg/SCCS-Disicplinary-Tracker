// Recognition — PBIS positive-behaviour recognitions. Staff "catch students
// doing the right thing" in two taps; the school sees its positive-to-
// corrective ratio next to the discipline numbers.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Award, Crown, Handshake, HeartHandshake, Minus, Plus, ShieldCheck, Sparkles, Star, Trophy } from 'lucide-react';
import api from '../lib/api';
import { useI18n } from '../i18n';
import { EmptyState, PageHeader, Segmented, Sheet, Skeleton, StudentAvatar, formatShortDate } from '../components/kit';

interface RecognitionItem {
  id: number;
  student_id: number;
  category: string;
  points: number;
  note: string | null;
  awarded_by: string | null;
  date: string;
  first_name: string;
  last_name: string;
  grade: number;
  section: string | null;
  profile_picture: string | null;
}
interface RecognitionResponse {
  total: number;
  points: number;
  students: number;
  byCategory: { category: string; count: number }[];
  leaders: { student_id: number; first_name: string; last_name: string; grade: number; points: number; count: number }[];
  items: RecognitionItem[];
}
interface StudentLite { id: number; student_id: string; first_name: string; last_name: string; grade: number }

export const RECOGNITION_CATEGORIES = [
  { value: 'Respect', icon: Handshake },
  { value: 'Responsibility', icon: ShieldCheck },
  { value: 'Integrity', icon: Star },
  { value: 'Kindness', icon: HeartHandshake },
  { value: 'Leadership', icon: Crown },
  { value: 'Excellence', icon: Trophy },
] as const;

export default function Recognition() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [data, setData] = useState<RecognitionResponse | null>(null);
  const [incidents30, setIncidents30] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(params.get('new') === '1');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rec, ew] = await Promise.all([
        api.get<RecognitionResponse>(`/recognitions?days=${range}&limit=40`),
        api.get<any>('/insights/early-warning?limit=1').catch(() => null),
      ]);
      setData(rec.data);
      setIncidents30(ew?.data?.summary?.incidents_30d ?? null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const closeSheet = () => {
    setOpen(false);
    if (params.get('new')) { const n = new URLSearchParams(params); n.delete('new'); setParams(n, { replace: true }); }
  };

  const ratio = range === '30' && data && incidents30 ? (data.total / incidents30) : null;

  return (
    <div className="animate-fade-in pb-24 md:pb-8 max-w-6xl mx-auto">
      <PageHeader
        title={t('Recognition')}
        subtitle={t('Catch students doing the right thing. Positive behavior, tracked next to discipline.')}
        actions={(
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Award className="w-4 h-4" /> {t('Recognize a Student')}
          </button>
        )}
      />

      <div className="flex justify-between items-center mb-4">
        <Segmented
          label={t('Time range')}
          value={range}
          onChange={setRange}
          options={[{ value: '7', label: t('7 days') }, { value: '30', label: t('30 days') }, { value: '90', label: t('90 days') }]}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="metric metric-green">
          <span className="metric-label">{t('Recognitions')}</span>
          <span className="metric-value" data-testid="recognition-total">{loading ? '-' : data?.total ?? 0}</span>
        </div>
        <div className="metric metric-blue">
          <span className="metric-label">{t('Points awarded')}</span>
          <span className="metric-value">{loading ? '-' : data?.points ?? 0}</span>
        </div>
        <div className="metric metric-purple">
          <span className="metric-label">{t('Students recognized')}</span>
          <span className="metric-value">{loading ? '-' : data?.students ?? 0}</span>
        </div>
        <div className="metric metric-orange">
          <span className="metric-label">{t('Positive to corrective')}</span>
          <span className="metric-value">{ratio ? `${ratio.toFixed(1)} : 1` : '-'}</span>
          <span className="metric-foot">{t('PBIS goal is 4 : 1')}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <section className="card p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="section-title">{t('Latest recognitions')}</h2>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !data?.items.length ? (
            <EmptyState icon={<Sparkles className="w-6 h-6" />} title={t('No recognitions yet')} body={t('Recognize a student to start the streak.')} />
          ) : (
            <ul className="list-inset" data-testid="recognition-feed">
              {data.items.map((r) => {
                const Icon = RECOGNITION_CATEGORIES.find((c) => c.value === r.category)?.icon ?? Star;
                return (
                  <li key={r.id}>
                    <button type="button" className="list-row" onClick={() => navigate(`/students/${r.student_id}`)}>
                      <StudentAvatar first={r.first_name} last={r.last_name} grade={r.grade} picture={r.profile_picture} />
                      <span className="flex-1 min-w-0 text-left">
                        <span className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                          <span className="font-semibold text-gray-900 break-words">{r.first_name} {r.last_name}</span>
                          <span className="value-chip"><Icon className="w-3.5 h-3.5" /> {t(r.category)}</span>
                        </span>
                        <span className="block text-sm text-gray-500 line-clamp-2">{r.note || t('Recognized')}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-sm font-semibold text-green-700">+{r.points}</span>
                        <span className="block text-xs text-gray-500">{formatShortDate(r.date, lang)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <section className="card">
            <h2 className="section-title mb-3">{t('Top students')}</h2>
            {loading ? <Skeleton className="h-40" /> : (
              <ol className="space-y-3" data-testid="recognition-leaders">
                {data?.leaders.slice(0, 5).map((l, i) => (
                  <li key={l.student_id} className="flex items-center gap-3">
                    <span className="w-5 text-sm font-semibold text-gray-400 tabular-nums">{i + 1}</span>
                    <StudentAvatar first={l.first_name} last={l.last_name} grade={l.grade} size={32} />
                    <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 break-words">{l.first_name} {l.last_name}</span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{l.points}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="card">
            <h2 className="section-title mb-3">{t('By value')}</h2>
            <div className="grid grid-cols-2 gap-2">
              {RECOGNITION_CATEGORIES.map(({ value, icon: Icon }) => (
                <div key={value} className="rounded-2xl bg-gray-50 p-3">
                  <Icon className="w-4 h-4 text-gray-500" />
                  <p className="text-lg font-semibold text-gray-900 mt-1 tabular-nums">{data?.byCategory.find((c) => c.category === value)?.count ?? 0}</p>
                  <p className="text-xs text-gray-500">{t(value)}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <RecognizeSheet
        open={open}
        onClose={closeSheet}
        presetStudentId={Number(params.get('student')) || undefined}
        onSaved={(name) => { closeSheet(); setToast(t('{name} was recognized', { name })); load(); setTimeout(() => setToast(''), 3500); }}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export function RecognizeSheet({
  open, onClose, onSaved, presetStudentId,
}: { open: boolean; onClose: () => void; onSaved: (name: string) => void; presetStudentId?: number }) {
  const { t } = useI18n();
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [query, setQuery] = useState('');
  const [student, setStudent] = useState<StudentLite | null>(null);
  const [category, setCategory] = useState<string>('Respect');
  const [points, setPoints] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(''); setNote(''); setPoints(1); setCategory('Respect');
    setStudent(null); setQuery('');
    api.get<StudentLite[]>('/students').then((r) => {
      setStudents(r.data);
      // Only fill in a preset student; never clear what the user already typed.
      const preset = presetStudentId ? r.data.find((s) => s.id === presetStudentId) : null;
      if (preset) {
        setStudent(preset);
        setQuery(`${preset.first_name} ${preset.last_name}`);
      }
    }).catch(() => undefined);
  }, [open, presetStudentId]);

  const matches = query.length >= 2 && !student
    ? students.filter((s) => `${s.first_name} ${s.last_name} ${s.last_name}, ${s.first_name} ${s.student_id}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  const save = async () => {
    if (!student) { setError(t('Choose a student')); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/recognitions', { student_id: student.id, category, points, note });
      onSaved(`${student.first_name} ${student.last_name}`);
    } catch (e: any) {
      setError(e?.response?.data?.error || t('Could not save the recognition'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Recognize a Student')}
      testId="recognize-sheet"
      footer={(
        <>
          <button className="btn btn-secondary flex-1" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn btn-primary flex-1" onClick={save} disabled={saving}>{saving ? t('Saving...') : t('Recognize')}</button>
        </>
      )}
    >
      <div className="space-y-5">
        <div className="relative">
          <label className="form-label" htmlFor="rec-student">{t('Student')}</label>
          <input
            id="rec-student"
            className="input"
            value={query}
            autoComplete="off"
            onChange={(e) => { setQuery(e.target.value); setStudent(null); }}
            placeholder={t('Type a name or student ID')}
          />
          {matches.length > 0 && (
            <ul className="popover-list" role="listbox">
              {matches.map((s) => (
                <li key={s.id}>
                  <button type="button" role="option" aria-selected={false} onClick={() => { setStudent(s); setQuery(`${s.first_name} ${s.last_name}`); }}>
                    {s.first_name} {s.last_name} <span className="text-gray-500">· {s.student_id} · {t('Grade')} {s.grade}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <span className="form-label">{t('Value shown')}</span>
          <div className="grid grid-cols-3 gap-2">
            {RECOGNITION_CATEGORIES.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
                className={`value-tile ${category === value ? 'is-active' : ''}`}
              >
                <Icon className="w-5 h-5" />
                <span>{t(value)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="form-label mb-0">{t('Points')}</span>
          <div className="stepper">
            <button type="button" aria-label={t('Fewer points')} onClick={() => setPoints((p) => Math.max(1, p - 1))}><Minus className="w-4 h-4" /></button>
            <span className="tabular-nums" data-testid="rec-points">{points}</span>
            <button type="button" aria-label={t('More points')} onClick={() => setPoints((p) => Math.min(5, p + 1))}><Plus className="w-4 h-4" /></button>
          </div>
        </div>

        <div>
          <label className="form-label" htmlFor="rec-note">{t('What did they do?')}</label>
          <textarea id="rec-note" className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. Helped a classmate who was struggling')} />
        </div>

        {error && <div className="callout callout-danger">{error}</div>}
      </div>
    </Sheet>
  );
}

// Secondary Disciplinary Referral. Every staff member can file one; only
// coordinators can read them (inbox + detail), and they are emailed when a new
// referral arrives (server side, see /api/referrals).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, X, Inbox, FilePlus2, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { useAuth } from '../App';
import { useI18n } from '../i18n';
import { PageHeader, Segmented, Sheet, Skeleton, formatShortDate, todayISO } from '../components/kit';

interface StudentLite { id: number; first_name: string; last_name: string; student_id: string; grade: number | string }
interface Referral {
  id: number;
  student_names: string;
  incident_date: string | null;
  strengths: string;
  situation: string;
  strategies_used: string;
  suggestions: string;
  status: 'New' | 'In review' | 'Closed';
  coordinator_notes: string | null;
  submitted_by_name: string;
  email_status: string | null;
  created_at: string;
}

// The questions, word for word, with their guiding prompts.
const QUESTIONS = [
  {
    key: 'strengths',
    label: 'What are the strengths/positive attributes of the student?',
    hint: '',
  },
  {
    key: 'situation',
    label: 'Describe the situation that led to the referral.',
    hint: 'Answer the questions "What happened?" and "Who was impacted by what happened?"',
  },
  {
    key: 'strategies_used',
    label: 'What strategies did you use to address the situation with the student?',
    hint: 'Answer the question "What needed to happen to make things right?" How did or could you have acknowledged the child\'s positive attributes/behaviors in order to redirect/prevent escalation?',
  },
  {
    key: 'suggestions',
    label: 'What suggestions or strategies do you think would work with this student so that the behavior does not repeat itself again in the future?',
    hint: 'Answer the question: Is there something that needs to occur in order to repair any harm that was done to people, relationships, or classroom communities that were affected? Which suggestions or strategies do you think will promote and increase positive behavior in this child?',
  },
] as const;
type AnswerKey = (typeof QUESTIONS)[number]['key'];

const STATUS_BADGE: Record<Referral['status'], string> = {
  New: 'badge-danger',
  'In review': 'badge-warning',
  Closed: 'badge-success',
};

export default function Referrals() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isCoordinator = user?.role === 'coordinator';
  // The signed-in user can arrive after the first render, so the default tab
  // is derived (coordinators land in their inbox) until someone picks one.
  const [picked, setTab] = useState<'inbox' | 'new' | null>(null);
  const tab = picked ?? (isCoordinator ? 'inbox' : 'new');

  return (
    <div className="animate-fade-in max-w-4xl">
      <PageHeader
        title={t('Secondary Disciplinary Referral')}
        subtitle={isCoordinator
          ? t('Referrals filed by staff. Only coordinators can see them.')
          : t('Tell the coordinators what happened. Only coordinators can read referrals.')}
      />
      {isCoordinator && (
        <div className="mb-5">
          <Segmented
            label={t('Referral view')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'inbox', label: t('Inbox') },
              { value: 'new', label: t('New referral') },
            ]}
          />
        </div>
      )}
      {isCoordinator && tab === 'inbox' ? <ReferralInbox /> : <ReferralForm onFiled={() => isCoordinator && setTab('inbox')} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form (all staff)
// ---------------------------------------------------------------------------
function ReferralForm({ onFiled }: { onFiled: () => void }) {
  const { t } = useI18n();
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [picked, setPicked] = useState<StudentLite[]>([]);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(todayISO());
  const [answers, setAnswers] = useState<Record<AnswerKey, string>>({ strengths: '', situation: '', strategies_used: '', suggestions: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<{ id: number; email_status: string } | null>(null);

  useEffect(() => {
    api.get<StudentLite[]>('/students').then((r) => setStudents(r.data)).catch(() => undefined);
  }, []);

  // Secondary only (grades 6-12).
  const matches = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return students
      .filter((s) => Number(s.grade) >= 6 && !picked.some((p) => p.id === s.id))
      .filter((s) => `${s.first_name} ${s.last_name} ${s.last_name}, ${s.first_name} ${s.student_id}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, students, picked]);

  const submit = async () => {
    if (picked.length === 0) { setError(t('Choose at least one student')); return; }
    if (QUESTIONS.some((q) => !answers[q.key].trim())) { setError(t('Please answer every question')); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/referrals', { student_ids: picked.map((s) => s.id), incident_date: date || null, ...answers });
      setReceipt(res.data);
      setPicked([]);
      setAnswers({ strengths: '', situation: '', strategies_used: '', suggestions: '' });
      setQuery('');
    } catch (e: any) {
      setError(e?.response?.data?.error || t('Could not send the referral'));
    } finally {
      setSaving(false);
    }
  };

  if (receipt) {
    return (
      <div className="card text-center py-10" data-testid="referral-receipt">
        <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-gray-900">{t('Referral #{id} sent', { id: receipt.id })}</h2>
        <p className="text-gray-500 mt-2 max-w-md mx-auto">
          {receipt.email_status === 'sent'
            ? t('The coordinators have been emailed and can see it in their inbox.')
            : t('The coordinators can see it in their inbox in the app.')}
        </p>
        <button type="button" className="btn btn-primary mt-6" onClick={() => { setReceipt(null); onFiled(); }}>
          {t('Done')}
        </button>
      </div>
    );
  }

  return (
    <form
      className="card space-y-6"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      aria-label={t('Secondary Disciplinary Referral')}
    >
      <div className="relative">
        <label className="form-label" htmlFor="ref-student">{t('Name of Student(s) Involved')}</label>
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {picked.map((s) => (
              <span key={s.id} className="chip-toggle is-active !cursor-default">
                {s.first_name} {s.last_name}
                <button type="button" aria-label={t('Remove {name}', { name: `${s.first_name} ${s.last_name}` })} onClick={() => setPicked((p) => p.filter((x) => x.id !== s.id))}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          id="ref-student"
          className="input"
          value={query}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Type a name or student ID')}
        />
        {matches.length > 0 && (
          <ul className="popover-list" role="listbox">
            {matches.map((s) => (
              <li key={s.id}>
                <button type="button" role="option" aria-selected={false} onClick={() => { setPicked((p) => [...p, s]); setQuery(''); }}>
                  {s.first_name} {s.last_name} <span className="text-gray-500">· {s.student_id} · {t('Grade')} {s.grade}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="max-w-xs">
        <label className="form-label" htmlFor="ref-date">{t('Date of the incident')}</label>
        <input id="ref-date" type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </div>

      {QUESTIONS.map((q) => (
        <div key={q.key}>
          <label className="block text-[15px] font-semibold text-gray-900 leading-snug" htmlFor={`ref-${q.key}`}>{t(q.label)}</label>
          {q.hint && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{t(q.hint)}</p>}
          <textarea
            id={`ref-${q.key}`}
            className="input mt-2 min-h-[120px]"
            value={answers[q.key]}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
          />
        </div>
      ))}

      {error && <div className="callout callout-danger" role="alert">{error}</div>}

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Send className="w-4 h-4" /> {saving ? t('Sending...') : t('Send to coordinators')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Inbox (coordinators)
// ---------------------------------------------------------------------------
function ReferralInbox() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<'New' | 'In review' | 'Closed' | 'all'>('all');
  const [items, setItems] = useState<Referral[] | null>(null);
  const [selected, setSelected] = useState<Referral | null>(null);

  const load = useCallback(() => {
    api.get<Referral[]>('/referrals', { params: { status } }).then((r) => setItems(r.data)).catch(() => setItems([]));
  }, [status]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load());

  // Deep link from the notification email: #/referrals?id=12
  useEffect(() => {
    const id = Number(params.get('id'));
    if (!id) return;
    api.get<Referral>(`/referrals/${id}`).then((r) => setSelected(r.data)).catch(() => undefined);
  }, [params]);

  const close = () => {
    setSelected(null);
    if (params.get('id')) { params.delete('id'); setParams(params, { replace: true }); }
  };

  return (
    <>
      <div className="mb-4 overflow-x-auto">
        <Segmented
          label={t('Status')}
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: t('All') },
            { value: 'New', label: t('New') },
            { value: 'In review', label: t('In review') },
            { value: 'Closed', label: t('Closed') },
          ]}
        />
      </div>
      <div className="card p-0 overflow-hidden">
        {items === null ? (
          <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-14 text-gray-500">
            <Inbox className="w-10 h-10 mx-auto mb-2 text-gray-400" />
            <p>{t('No referrals here yet')}</p>
          </div>
        ) : (
          <ul className="list-inset">
            {items.map((r) => (
              <li key={r.id}>
                <button type="button" className="list-row !items-start" data-testid="referral-row" onClick={() => setSelected(r)}>
                  <span className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <FilePlus2 className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-gray-900 leading-snug">{r.student_names}</span>
                      <span className={`badge shrink-0 ${STATUS_BADGE[r.status]}`}>{t(r.status)}</span>
                    </span>
                    <span className="block text-sm text-gray-500 line-clamp-2 mt-0.5">{r.situation}</span>
                    <span className="block text-xs text-gray-500 mt-1">
                      #{r.id} · {t('Filed by {name}', { name: r.submitted_by_name })} · {formatShortDate(r.created_at, lang)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected && (
        <ReferralDetail
          referral={selected}
          onClose={close}
          onSaved={(r) => { setSelected(r); load(); }}
        />
      )}
    </>
  );
}

function ReferralDetail({ referral, onClose, onSaved }: { referral: Referral; onClose: () => void; onSaved: (r: Referral) => void }) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState(referral.status);
  const [notes, setNotes] = useState(referral.coordinator_notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setStatus(referral.status); setNotes(referral.coordinator_notes ?? ''); }, [referral]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.put<Referral>(`/referrals/${referral.id}`, { status, coordinator_notes: notes });
      onSaved(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || t('Could not save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={t('Referral #{id}', { id: referral.id })}
      testId="referral-detail"
      footer={(
        <>
          <button className="btn btn-secondary flex-1" onClick={onClose}>{t('Close')}</button>
          <button className="btn btn-primary flex-1" onClick={save} disabled={saving}>{saving ? t('Saving...') : t('Save')}</button>
        </>
      )}
    >
      <div className="space-y-5">
        <div>
          <p className="text-lg font-semibold text-gray-900">{referral.student_names}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('Filed by {name}', { name: referral.submitted_by_name })} · {formatShortDate(referral.created_at, lang)}
            {referral.incident_date && <> · {t('Incident')}: {formatShortDate(referral.incident_date, lang)}</>}
          </p>
        </div>
        {QUESTIONS.map((q) => (
          <section key={q.key}>
            <h3 className="text-sm font-semibold text-gray-700">{t(q.label)}</h3>
            <p className="mt-1 text-[15px] text-gray-900 whitespace-pre-wrap leading-relaxed">{referral[q.key]}</p>
          </section>
        ))}
        <div className="border-t border-gray-200 pt-5 space-y-4">
          <div>
            <span className="form-label">{t('Status')}</span>
            <Segmented
              label={t('Status')}
              value={status}
              onChange={setStatus}
              options={[
                { value: 'New', label: t('New') },
                { value: 'In review', label: t('In review') },
                { value: 'Closed', label: t('Closed') },
              ]}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="ref-notes">{t('Coordinator notes')}</label>
            <textarea id="ref-notes" className="input min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <div className="callout callout-danger">{error}</div>}
        </div>
      </div>
    </Sheet>
  );
}

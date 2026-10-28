// The whole app for parent and student accounts: their linked students'
// conduct standing, incidents and recognitions (from /api/family), and a
// password change. Staff screens are never shown to these roles, and the API
// refuses them (see withAuth in src/lib/sccs-auth.ts).
import { useEffect, useState } from 'react';
import { Award, KeyRound, LogOut, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from '../App';
import api from '../lib/api';
import ChangePasswordForm from '../components/ChangePasswordForm';
import LanguageToggle from '../components/LanguageToggle';
import { EmptyState, Skeleton, StudentAvatar, formatShortDate } from '../components/kit';
import { useI18n } from '../i18n';

interface FamilyIncident {
  id: number;
  date: string;
  location: string | null;
  consequence: string | null;
  points_deducted: number;
  days_iss: number;
  days_oss: number;
  detention_hours: number;
  status: string;
  violation: { category: string; violation_type: string };
}

interface FamilyStudent {
  id: number;
  student_id: string;
  first_name: string;
  last_name: string;
  grade: number;
  total_points: number;
  conduct_status: string;
  incidents: FamilyIncident[];
  recognitions: { id: number; date: string; category: string; points: number }[];
}

export default function FamilyHome() {
  const { user, login, logout } = useAuth();
  const { t, lang } = useI18n();
  const [students, setStudents] = useState<FamilyStudent[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  useEffect(() => {
    api
      .get('/family')
      .then((res) => setStudents(res.data.students))
      .catch(() => setLoadFailed(true));
  }, []);

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-4 py-6 md:py-10">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="page-title">{t('Welcome, {name}', { name: user?.firstName || user?.username || '' })}</h1>
          <p className="page-subtitle">
            {user?.role === 'student' ? t('Your conduct record') : t("Your children's conduct record")}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <LanguageToggle />
          <button type="button" onClick={logout} className="btn btn-secondary" aria-label={t('Log Out')}>
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{t('Log Out')}</span>
          </button>
        </div>
      </div>

      {loadFailed && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
          {t('Could not load your students')}
        </div>
      )}

      {students === null && !loadFailed && (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-[20px]" />
          <Skeleton className="h-40 rounded-[20px]" />
        </div>
      )}

      {students?.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title={t('No students are linked to your account yet')}
            body={t('Ask the school office to link your account to your student.')}
          />
        </div>
      )}

      <div className="space-y-6">
        {students?.map((s) => (
          <section key={s.id} className="card p-5" data-testid="family-student">
            <div className="flex items-center gap-3 mb-4">
              <StudentAvatar first={s.first_name} last={s.last_name} grade={s.grade} size={48} />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-gray-900 break-words">
                  {s.first_name} {s.last_name}
                </h2>
                <p className="text-sm text-gray-500">
                  {s.grade === 0 ? t('Pre-K/K') : t('Grade {grade}', { grade: s.grade })} · {s.student_id}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-semibold text-gray-900">{s.total_points}</p>
                <p className="text-xs text-gray-500">{t(s.conduct_status)}</p>
              </div>
            </div>

            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              {t('Incidents')} ({s.incidents.length})
            </h3>
            {s.incidents.length === 0 ? (
              <p className="text-sm text-gray-500 mb-4">{t('No incidents recorded.')}</p>
            ) : (
              <ul className="divide-y divide-black/5 mb-4">
                {s.incidents.map((i) => (
                  <li key={i.id} className="py-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-gray-900 min-w-0 break-words">{i.violation.violation_type}</p>
                      <span className="text-xs text-gray-500 shrink-0">{formatShortDate(i.date, lang)}</span>
                    </div>
                    <p className="text-gray-500 break-words">
                      {[t(i.status), i.consequence, i.points_deducted ? t('{n} points', { n: i.points_deducted }) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Award className="w-4 h-4" />
              {t('Recognition')} ({s.recognitions.length})
            </h3>
            {s.recognitions.length === 0 ? (
              <p className="text-sm text-gray-500">{t('No recognitions yet.')}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {s.recognitions.map((r) => (
                  <li key={r.id} className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700">
                    {t(r.category)} · {formatShortDate(r.date, lang)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            {t('Change Password')}
          </h2>
          {passwordChanged && (
            <p className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm mb-4">
              {t('Password changed. Other devices have been signed out.')}
            </p>
          )}
          <ChangePasswordForm
            onChanged={(token) => {
              login(user, token);
              setPasswordChanged(true);
            }}
          />
        </section>
      </div>
    </div>
  );
}

// Spotlight-style command palette (Cmd/Ctrl + K): jump to any screen, run a
// quick action, or open a student by name or ID from anywhere in the app.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import api from '../lib/api';
import { useI18n } from '../i18n';
import { StudentAvatar } from './kit';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
  keywords?: string;
}

interface StudentLite { id: number; student_id: string; first_name: string; last_name: string; grade: number; profile_picture?: string | null }

type Row =
  | { kind: 'command'; cmd: PaletteCommand }
  | { kind: 'student'; student: StudentLite };

export default function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [students, setStudents] = useState<StudentLite[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset only when the palette opens (never when the student list arrives,
  // which would wipe what the user already typed).
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (open && !students) {
      api.get<StudentLite[]>('/students').then((r) => setStudents(r.data)).catch(() => setStudents([]));
    }
  }, [open, students]);

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cmds = commands
      .filter((c) => !q || `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q))
      .map((cmd) => ({ kind: 'command' as const, cmd }));
    const studs = q.length >= 2 && students
      ? students
          .filter((s) => `${s.first_name} ${s.last_name} ${s.last_name}, ${s.first_name} ${s.student_id}`.toLowerCase().includes(q))
          .slice(0, 8)
          .map((student) => ({ kind: 'student' as const, student }))
      : [];
    return q ? [...studs, ...cmds] : cmds;
  }, [query, commands, students]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const runRow = (row: Row) => {
    onClose();
    if (row.kind === 'command') row.cmd.run();
    else navigate(`/students/${row.student.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && rows[active]) { e.preventDefault(); runRow(rows[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const studentRows = rows.filter((r) => r.kind === 'student');
  const commandRows = rows.filter((r) => r.kind === 'command');

  const renderRow = (row: Row, index: number) => {
    const isActive = index === active;
    if (row.kind === 'student') {
      const s = row.student;
      return (
        <button
          key={`s-${s.id}`}
          type="button"
          className={`palette-item ${isActive ? 'is-active' : ''}`}
          data-active={isActive}
          onMouseMove={() => setActive(index)}
          onClick={() => runRow(row)}
        >
          <StudentAvatar first={s.first_name} last={s.last_name} grade={s.grade} picture={s.profile_picture} size={30} />
          <span className="flex-1 min-w-0 truncate">{s.last_name}, {s.first_name}</span>
          <span className="text-sm text-gray-500">{s.student_id}</span>
        </button>
      );
    }
    const Icon = row.cmd.icon;
    return (
      <button
        key={row.cmd.id}
        type="button"
        className={`palette-item ${isActive ? 'is-active' : ''}`}
        data-active={isActive}
        onMouseMove={() => setActive(index)}
        onClick={() => runRow(row)}
      >
        <span className="palette-icon"><Icon className="w-4 h-4" /></span>
        <span className="flex-1 min-w-0 truncate">{row.cmd.label}</span>
        {row.cmd.hint && <span className="text-sm text-gray-500">{row.cmd.hint}</span>}
        {isActive && <CornerDownLeft className="w-4 h-4 opacity-80" />}
      </button>
    );
  };

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('Search')}
        data-testid="command-palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="palette-input">
          <Search className="w-5 h-5 text-gray-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Search students, screens and actions')}
            aria-label={t('Search students, screens and actions')}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="palette-results" ref={listRef}>
          {rows.length === 0 && <p className="text-sm text-gray-500 px-3 py-6 text-center">{t('No results for "{q}"', { q: query })}</p>}
          {studentRows.length > 0 && <p className="palette-section">{t('Students')}</p>}
          {studentRows.map((r) => renderRow(r, rows.indexOf(r)))}
          {commandRows.length > 0 && <p className="palette-section">{t('Go to')}</p>}
          {commandRows.map((r) => renderRow(r, rows.indexOf(r)))}
        </div>
      </div>
    </div>
  );
}

// Client-side mirror of the API's role rules (src/lib/sccs-auth.ts). It only
// decides what to SHOW — the API enforces every permission on its own.
import { useAuth } from '../App';

const has = (role: string | undefined, ...allowed: string[]) => !!role && allowed.includes(role);

export function usePermissions() {
  const { user } = useAuth();
  const role: string | undefined = user?.role;
  return {
    /** Parents, students and the default 'user' role: see only linked students. */
    isFamily: !role || has(role, 'parent', 'student', 'user'),
    isAdmin: has(role, 'admin'),
    canRecordIncidents: has(role, 'admin', 'principal', 'counselor', 'teacher'),
    canManageStudents: has(role, 'admin', 'counselor'),
  };
}

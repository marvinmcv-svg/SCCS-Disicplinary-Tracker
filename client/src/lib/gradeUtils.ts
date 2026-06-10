// Grade-based color utility for student avatars
// Each grade level has a unique color for visual differentiation

export const getGradeColor = (grade: string | number): string => {
  const gradeNum = typeof grade === 'string' ? parseInt(grade) : grade;
  switch (gradeNum) {
    case 0: return 'bg-pink-100 text-pink-700';       // Pre-K/K - Pink
    case 1: return 'bg-rose-100 text-rose-700';       // Grade 1 - Rose
    case 2: return 'bg-purple-100 text-purple-700';   // Grade 2 - Purple
    case 3: return 'bg-violet-100 text-violet-700';   // Grade 3 - Violet
    case 4: return 'bg-indigo-100 text-indigo-700';   // Grade 4 - Indigo
    case 5: return 'bg-blue-100 text-blue-700';       // Grade 5 - Blue
    case 6: return 'bg-cyan-100 text-cyan-700';       // Grade 6 - Cyan
    case 7: return 'bg-teal-100 text-teal-700';       // Grade 7 - Teal
    case 8: return 'bg-emerald-100 text-emerald-700'; // Grade 8 - Emerald
    case 9: return 'bg-green-100 text-green-700';     // Grade 9 - Green
    case 10: return 'bg-lime-100 text-lime-700';      // Grade 10 - Lime
    case 11: return 'bg-yellow-100 text-yellow-700';  // Grade 11 - Yellow/Gold
    case 12: return 'bg-orange-100 text-orange-700';  // Grade 12 - Orange
    default: return 'bg-gray-100 text-gray-700';
  }
};

export const getGradeLabel = (grade: string | number): string => {
  const gradeNum = typeof grade === 'string' ? parseInt(grade) : grade;
  return gradeNum === 0 ? 'Pre-K/K' : `Grade ${gradeNum}`;
};

export const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
};

// Grade order for sorting (Pre-K/K first, then 1-12)
export const GRADE_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// All available grades with labels
export const GRADES = GRADE_ORDER.map(g => ({
  value: g,
  label: getGradeLabel(g)
}));
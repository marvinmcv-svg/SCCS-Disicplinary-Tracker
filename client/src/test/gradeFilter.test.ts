import { describe, it, expect } from 'vitest';
import { matchesGradeFilter } from '../lib/gradeUtils';

// Regression coverage for the Students roster filter. The original inline
// implementation had an operator-precedence bug (`||` binds tighter than `?:`)
// that made the default 'all' filter evaluate `grade === parseInt('all')`,
// hiding every student on page load.

const student = (grade: string | number, section?: string | null) => ({ grade, section });

describe('matchesGradeFilter', () => {
  describe("the 'all' filter", () => {
    it('admits every student regardless of grade or section', () => {
      expect(matchesGradeFilter(student(9, 'A'), 'all')).toBe(true);
      expect(matchesGradeFilter(student(0), 'all')).toBe(true);
      expect(matchesGradeFilter(student(12, null), 'all')).toBe(true);
    });

    it('admits Pre-K, whose grade is the falsy value 0', () => {
      expect(matchesGradeFilter(student(0, 'B'), 'all')).toBe(true);
    });
  });

  describe('a bare grade filter', () => {
    it('matches that grade in any section', () => {
      expect(matchesGradeFilter(student(9, 'A'), '9')).toBe(true);
      expect(matchesGradeFilter(student(9, 'B'), '9')).toBe(true);
      expect(matchesGradeFilter(student(9, null), '9')).toBe(true);
    });

    it('rejects other grades', () => {
      expect(matchesGradeFilter(student(10, 'A'), '9')).toBe(false);
    });

    it('does not confuse grade 1 with grade 12', () => {
      expect(matchesGradeFilter(student(12), '1')).toBe(false);
      expect(matchesGradeFilter(student(1), '12')).toBe(false);
    });
  });

  describe('a grade + section filter', () => {
    it('requires both grade and section to match', () => {
      expect(matchesGradeFilter(student(9, 'A'), '9A')).toBe(true);
      expect(matchesGradeFilter(student(9, 'B'), '9A')).toBe(false);
      expect(matchesGradeFilter(student(10, 'A'), '9A')).toBe(false);
    });

    it('rejects a student with no section recorded', () => {
      expect(matchesGradeFilter(student(9, null), '9A')).toBe(false);
      expect(matchesGradeFilter(student(9, ''), '9A')).toBe(false);
    });

    it('handles two-digit grades with sections', () => {
      expect(matchesGradeFilter(student(11, 'B'), '11B')).toBe(true);
      expect(matchesGradeFilter(student(11, 'A'), '11B')).toBe(false);
    });
  });

  describe('grade arriving as a string', () => {
    // The API types grade as a number, the student form holds it as a string,
    // and Students.tsx declares a local type claiming string. Tolerate both.
    it('matches regardless of which type the caller supplies', () => {
      expect(matchesGradeFilter(student('9', 'A'), '9')).toBe(true);
      expect(matchesGradeFilter(student('9', 'A'), '9A')).toBe(true);
      expect(matchesGradeFilter(student('10'), '9')).toBe(false);
    });
  });

  describe('malformed filter values', () => {
    it('matches nothing rather than throwing', () => {
      expect(matchesGradeFilter(student(9, 'A'), '')).toBe(false);
      expect(matchesGradeFilter(student(9, 'A'), 'banana')).toBe(false);
    });
  });
});

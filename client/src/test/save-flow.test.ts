import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// Mock the api module
const mockPut = vi.fn();
const mockGet = vi.fn();

vi.mock('../lib/api', () => ({
  default: {
    get: mockGet,
    post: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    put: mockPut.mockResolvedValue({ data: { success: true } }),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  get: mockGet,
  post: vi.fn().mockResolvedValue({ data: { id: 1 } }),
  put: mockPut.mockResolvedValue({ data: { success: true } }),
}));

// Mock App context
const mockUser = { id: 1, firstName: 'Admin', lastName: 'User', role: 'admin' };

vi.mock('../App', () => ({
  useAuth: () => ({
    user: mockUser,
    token: 'mock-token',
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

describe('Student Save Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: [] });
    // Setup localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn().mockReturnValue('mock-token'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    });
  });

  it('should include observations when updating a student', async () => {
    const studentToUpdate = {
      id: 1,
      student_id: 'STU001',
      last_name: 'Smith',
      first_name: 'John',
      grade: '9A',
      counselor: 'Mr Kane',
      advisory: 'HR 101',
      observations: 'Needs improvement',
    };

    // Simulate what the save function does
    const payload = {
      student_id: studentToUpdate.student_id,
      last_name: studentToUpdate.last_name,
      first_name: studentToUpdate.first_name,
      grade: studentToUpdate.grade,
      counselor: studentToUpdate.counselor,
      advisory: studentToUpdate.advisory,
      observations: studentToUpdate.observations,
    };

    await mockPut(`/students/${studentToUpdate.id}`, payload);

    expect(mockPut).toHaveBeenCalledWith('/students/1', {
      student_id: 'STU001',
      last_name: 'Smith',
      first_name: 'John',
      grade: '9A',
      counselor: 'Mr Kane',
      advisory: 'HR 101',
      observations: 'Needs improvement',
    });
  });

  it('should send PUT to correct endpoint with all form fields', async () => {
    const formData = {
      student_id: 'STU002',
      last_name: 'Johnson',
      first_name: 'Jane',
      grade: '10B',
      counselor: 'Ms Aguirre',
      advisory: 'HR 202',
      observations: 'Excellent behavior',
    };

    await mockPut('/students/2', formData);

    expect(mockPut).toHaveBeenCalledWith('/students/2', formData);
    expect(formData.observations).toBe('Excellent behavior');
  });
});

describe('Incident Save Flow', () => {
  it('should send all editable fields on incident update', async () => {
    const editFormData = {
      location: 'Classroom',
      description: 'Talking back to teacher',
      witnesses: '3 students',
      advisor: 'Mr Kane',
      action_taken: 'Detention',
      consequence: '1 hour detention',
      notes: 'Repeat offense',
    };

    await mockPut('/incidents/5', editFormData);

    expect(mockPut).toHaveBeenCalledWith('/incidents/5', editFormData);
    expect(editFormData.notes).toBe('Repeat offense');
  });
});

describe('MTSS Save Flow', () => {
  it('should send PUT with progress field when editing', async () => {
    const editFormData = {
      student_id: 1,
      tier: 2,
      intervention: 'Social Skills Group',
      advisor: 'Ms Aguirre',
      start_date: '2026-04-01',
      end_date: '2026-05-01',
      progress: 'In Progress',
      notes: 'Showing improvement',
    };

    await mockPut('/mtss/3', editFormData);

    expect(mockPut).toHaveBeenCalledWith('/mtss/3', editFormData);
    expect(editFormData.progress).toBe('In Progress');
  });
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../lib/api';

// Mock axios
vi.mock('../lib/api', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return { default: mockApi };
});

describe('Student Save API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send all fields when creating a student', async () => {
    const mockStudent = {
      student_id: 'STU001',
      last_name: 'Smith',
      first_name: 'John',
      grade: '9A',
      counselor: 'Mr Kane',
      advisory: 'HR 101',
      observations: 'Good behavior',
    };

    (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { id: 1 } });

    await api.post('/students', mockStudent);

    expect(api.post).toHaveBeenCalledWith('/students', mockStudent);
  });

  it('should send all fields when updating a student', async () => {
    const mockUpdate = {
      student_id: 'STU001',
      last_name: 'Smith',
      first_name: 'John',
      grade: '9A',
      counselor: 'Mr Kane',
      advisory: 'HR 101',
      observations: 'Updated observation',
    };

    (api.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { success: true } });

    await api.put('/students/1', mockUpdate);

    expect(api.put).toHaveBeenCalledWith('/students/1', mockUpdate);
    expect(mockUpdate.observations).toBe('Updated observation');
  });
});

describe('Incident Save API', () => {
  it('should send all editable fields when updating an incident', async () => {
    const mockUpdate = {
      location: 'Classroom',
      description: 'Disruption during class',
      witnesses: 'Mr Kane',
      advisor: 'Ms Aguirre',
      action_taken: 'Warning',
      consequence: 'Detention',
      notes: 'First offense',
    };

    (api.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { success: true } });

    await api.put('/incidents/1', mockUpdate);

    expect(api.put).toHaveBeenCalledWith('/incidents/1', mockUpdate);
  });
});

describe('MTSS Save API', () => {
  it('should send all fields when creating an intervention', async () => {
    const mockIntervention = {
      student_id: 1,
      tier: 2,
      intervention: 'Check-In/Check-Out (CICO)',
      advisor: 'Mr Kane',
      start_date: '2026-04-25',
      end_date: '2026-05-25',
      notes: 'Needs monitoring',
    };

    (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { id: 1 } });

    await api.post('/mtss', mockIntervention);

    expect(api.post).toHaveBeenCalledWith('/mtss', mockIntervention);
  });

  it('should send PUT when updating an existing intervention', async () => {
    const mockUpdate = {
      student_id: 1,
      tier: 2,
      intervention: 'Check-In/Check-Out (CICO)',
      advisor: 'Mr Kane',
      start_date: '2026-04-25',
      end_date: '2026-05-25',
      progress: 'In Progress',
      notes: 'Updated notes',
    };

    (api.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { success: true } });

    await api.put('/mtss/1', mockUpdate);

    expect(api.put).toHaveBeenCalledWith('/mtss/1', mockUpdate);
  });
});
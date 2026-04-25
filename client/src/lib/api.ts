import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Shared types
export interface ApiError { error: string; }

export interface User {
  id: number;
  username: string;
  role: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface LoginResponse { token: string; user: User; }

export interface Student {
  id: number;
  student_id: string;
  last_name: string;
  first_name: string;
  grade: number;
  house_team?: string;
  counselor?: string;
  gpa: number;
  total_points: number;
  conduct_status: string;
  observations: string;
  created_at: string;
}

export interface Violation {
  id: number;
  category: string;
  violation_type: string;
  description: string | null;
  points_deduction: number;
  default_consequence: string | null;
  min_oss_days: number;
  max_oss_days: number;
}

export interface Incident {
  id: number;
  incident_id: string;
  date: string;
  time: string | null;
  student_id: number;
  violation_id: number;
  location: string | null;
  description: string | null;
  witnesses: string | null;
  parent_contacted: string;
  contact_date: string | null;
  action_taken: string | null;
  consequence: string | null;
  points_deducted: number;
  days_iss: number;
  days_oss: number;
  detention_hours: number;
  referral_date: string | null;
  administrator_id: number | null;
  notes: string | null;
  follow_up_needed: string;
  status: string;
  resolved_date: string | null;
  evidence: string | null;
  created_at: string;
  last_name?: string;
  first_name?: string;
  student_id_raw?: string;
  violation_type?: string;
  category?: string;
}

export interface MTSSIntervention {
  id: number;
  student_id: number;
  tier: number;
  intervention: string;
  advisor: string;
  start_date: string;
  end_date: string | null;
  progress: string;
  notes: string | null;
  created_at: string;
  last_name?: string;
  first_name?: string;
}

export interface DashboardStats {
  total: number;
  pending: number;
  resolved: number;
  byCategory: Array<{ category: string; count: number }>;
  recentIncidents: Array<{ id: number; incident_id: string; date: string; status: string; last_name: string; first_name: string; violation_type: string }>;
}

export interface IncidentCreatePayload {
  date: string;
  time?: string;
  student_id: number;
  violation_id: number;
  location?: string;
  description?: string;
  witnesses?: string;
  advisor?: string;
  action_taken?: string;
  consequence?: string;
  notes?: string;
}

export interface IncidentUpdatePayload {
  status?: string;
  parent_contacted?: string;
  contact_date?: string | null;
  action_taken?: string;
  consequence?: string;
  days_iss?: number;
  days_oss?: number;
  detention_hours?: number;
  notes?: string;
  follow_up_needed?: string;
  resolved_date?: string | null;
  advisor?: string;
}

export interface StudentCreatePayload {
  student_id: string;
  last_name: string;
  first_name: string;
  grade?: string;
  counselor?: string;
  advisory?: string;
}

export interface StudentUpdatePayload extends StudentCreatePayload {
  gpa?: number;
  total_points?: number;
  conduct_status?: string;
  observations?: string;
}

export interface UserCreatePayload {
  username: string;
  password: string;
  role?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  classroom?: string;
}

export interface UserUpdatePayload extends UserCreatePayload {
  newPassword?: string;
}

export interface VersionInfo {
  version: string;
  buildDate: string;
  minAppVersion: string;
}

// Typed API functions - use apiClient to get baseURL and interceptors
export const api = {
  get: <T>(url: string) => apiClient.get<T>(url),
  post: <T>(url: string, data?: unknown) => apiClient.post<T>(url, data),
  put: <T>(url: string, data?: unknown) => apiClient.put<T>(url, data),
  delete: <T>(url: string) => apiClient.delete<T>(url),
};

const apiClient = axios.create({
  baseURL: API_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
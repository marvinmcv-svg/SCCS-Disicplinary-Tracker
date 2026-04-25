import '@testing-library/jest-dom';
import { beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock localStorage
beforeEach(() => {
  const storageMock = {
    getItem: vi.fn(),
    setItem: vi.fn((key, value) => {
      storageMock.store[key] = value;
    }),
    removeItem: vi.fn(),
    clear: vi.fn(),
    store: {} as Record<string, string>,
  };
  Object.defineProperty(window, 'localStorage', { value: storageMock });
});

// Mock import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_APP_VERSION: '1.0.0',
    VITE_API_URL: '/api',
  },
  writable: true,
});
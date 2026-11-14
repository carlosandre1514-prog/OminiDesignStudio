import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

interface ToastStore {
  toasts: Toast[];
  push(message: string, kind?: Toast['kind']): void;
  dismiss(id: number): void;
}

let seq = 0;

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push(message, kind = 'info') {
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, message, kind }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 7000 : 3500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = {
  info: (m: string) => useToasts.getState().push(m, 'info'),
  success: (m: string) => useToasts.getState().push(m, 'success'),
  error: (m: string) => useToasts.getState().push(m, 'error'),
};

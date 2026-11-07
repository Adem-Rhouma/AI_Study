import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { Preferences, SessionPayload } from '../api/types';

export type Session = SessionPayload;

type SessionValue = {
  session: Session;
  isLoading: boolean;
  isAuthenticated: boolean;
  isStaff: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

export function useAuthQuery() {
  return useQuery({
    queryKey: keys.session,
    queryFn: () => api.get<Session>('/auth/me'),
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { displayName?: string; bio?: string | null }) =>
      api.patch<Session>('/auth/me', input),
    onSuccess: (data) => client.setQueryData(keys.session, data)
  });
}

/** The server replaces the whole preference row, so the caller always sends a complete object. */
export function useUpdatePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Preferences) =>
      api.put<{ preferences: Preferences }>('/auth/me/preferences', input),
    onSuccess: ({ preferences }) =>
      client.setQueryData<Session>(keys.session, (current) =>
        current ? { ...current, preferences } : current
      )
  });
}

export function useChangePassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api.post<{ ok: boolean; note: string }>('/auth/me/password', input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.session })
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ ok: boolean; message: string; devLink?: string }>('/auth/forgot-password', { email })
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { token: string; newPassword: string }) =>
      api.post<{ ok: boolean }>('/auth/reset-password', input)
  });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useAuthQuery();
  const session = query.data ?? { user: null, preferences: null };

  const value: SessionValue = {
    session,
    isLoading: query.isLoading,
    isAuthenticated: session.user !== null,
    isStaff: session.user?.role === 'admin' || session.user?.role === 'author',
    login: async (email, password) => {
      const data = await api.post<Session>('/auth/login', { email, password });
      client.setQueryData(keys.session, data);
      await client.invalidateQueries();
    },
    register: async (email, password, displayName) => {
      const data = await api.post<Session>('/auth/register', { email, password, displayName });
      client.setQueryData(keys.session, data);
      await client.invalidateQueries();
    },
    logout: async () => {
      await api.post<{ ok: boolean }>('/auth/logout');
      client.clear();
      client.setQueryData<Session>(keys.session, { user: null, preferences: null });
    }
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

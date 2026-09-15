import { create } from "zustand";
import type { AppRole } from "@/types/domain";
import { setAuthLostHandler, setToken } from "@/api/client";
import { LS } from "@/lib/storage";
import { queryClient } from "@/lib/queryClient";
import { clearChatAccount } from "@/features/chat/chatPersistence";

interface SessionState {
  authenticated: boolean;
  role: AppRole | null;
  userId: string | null;
  setAuth: (token: string, role: AppRole, userId: string) => void;
  setRole: (role: AppRole) => void;
  logout: () => void;
}

const savedRole = (localStorage.getItem(LS.role) as AppRole | null) ?? null;

export const useSession = create<SessionState>((set, get) => ({
  authenticated: Boolean(localStorage.getItem(LS.jwt)),
  role: savedRole,
  userId: localStorage.getItem(LS.uid),
  setAuth: (token, role, userId) => {
    const previousUserId = get().userId;
    const previousRole = get().role;
    const identityChanged = previousUserId !== userId || previousRole !== role;
    if (identityChanged) {
      queryClient.clear();
      if (previousUserId && previousRole) {
        clearChatAccount(previousUserId, previousRole);
      }
    }
    setToken(token);
    localStorage.setItem(LS.role, role);
    localStorage.setItem(LS.uid, userId);
    set({ authenticated: true, role, userId });
  },
  setRole: (role) => {
    localStorage.setItem(LS.role, role);
    set({ role });
  },
  logout: () => {
    const currentUserId = get().userId;
    const currentRole = get().role;
    if (currentUserId && currentRole) clearChatAccount(currentUserId, currentRole);
    setToken(null);
    queryClient.clear();
    localStorage.removeItem(LS.role);
    localStorage.removeItem(LS.uid);
    set({ authenticated: false, role: null, userId: null });
  },
}));

// Потерянный вход обрабатывается ЗДЕСЬ, а не в сетевом слое: там не было
// доступа к флагу authenticated, и он оставался true при выброшенном токене.
setAuthLostHandler(() => useSession.getState().logout());

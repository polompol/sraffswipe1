import { create } from "zustand";
import type { AppRole } from "@/types/domain";
import { setToken } from "@/api/client";
import { LS } from "@/lib/storage";

interface SessionState {
  authenticated: boolean;
  role: AppRole | null;
  userId: string | null;
  setAuth: (token: string, role: AppRole, userId: string) => void;
  setRole: (role: AppRole) => void;
  logout: () => void;
}

const savedRole = (localStorage.getItem(LS.role) as AppRole | null) ?? null;

export const useSession = create<SessionState>((set) => ({
  authenticated: Boolean(localStorage.getItem(LS.jwt)),
  role: savedRole,
  userId: localStorage.getItem(LS.uid),
  setAuth: (token, role, userId) => {
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
    setToken(null);
    localStorage.removeItem(LS.role);
    localStorage.removeItem(LS.uid);
    set({ authenticated: false, role: null, userId: null });
  },
}));

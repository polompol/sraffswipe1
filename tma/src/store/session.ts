import { create } from "zustand";
import type { AppRole } from "@/types/domain";
import { setToken } from "@/api/client";

interface SessionState {
  authenticated: boolean;
  role: AppRole | null;
  userId: string | null;
  setAuth: (token: string, role: AppRole, userId: string) => void;
  setRole: (role: AppRole) => void;
  logout: () => void;
}

const savedRole = (localStorage.getItem("ss_role") as AppRole | null) ?? null;

export const useSession = create<SessionState>((set) => ({
  authenticated: Boolean(localStorage.getItem("ss_jwt")),
  role: savedRole,
  userId: localStorage.getItem("ss_uid"),
  setAuth: (token, role, userId) => {
    setToken(token);
    localStorage.setItem("ss_role", role);
    localStorage.setItem("ss_uid", userId);
    set({ authenticated: true, role, userId });
  },
  setRole: (role) => {
    localStorage.setItem("ss_role", role);
    set({ role });
  },
  logout: () => {
    setToken(null);
    localStorage.removeItem("ss_role");
    localStorage.removeItem("ss_uid");
    set({ authenticated: false, role: null, userId: null });
  },
}));

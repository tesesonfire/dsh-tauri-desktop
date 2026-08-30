import { create } from "zustand";
import type { Profile } from "@/types/dsh";
import {
  profileActive,
  profileCreate,
  profileDelete,
  profileList,
  profileSwitch,
} from "@/services/tauriService";

interface ProfileState {
  profiles: Profile[];
  activeId: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (name: string, port?: number) => Promise<void>;
  remove: (name: string) => Promise<void>;
  switchTo: (name: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeId: "",
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true });
    try {
      const [profiles, activeId] = await Promise.all([profileList(), profileActive()]);
      set({ profiles, activeId, error: null });
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ loading: false });
    }
  },

  create: async (name, port) => {
    await profileCreate(name, port);
    await get().refresh();
  },

  remove: async (name) => {
    await profileDelete(name);
    if (get().activeId === name) {
      await profileSwitch("");
      set({ activeId: "" });
    }
    await get().refresh();
  },

  switchTo: async (name) => {
    await profileSwitch(name);
    set({ activeId: name });
  },
}));

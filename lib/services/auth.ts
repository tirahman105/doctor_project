import type { Role } from "@/types/carebridge";
import { requireLocalDemo } from "@/lib/config/shared";
export interface AuthService {
  getRole(): Role | null;
  signIn(role: Role): void;
  signOut(): void;
}
const key = "carebridge-demo-role";
// Demo UX guard only: browser state is not production authorization.
export const demoAuth: AuthService = {
  getRole() {
    requireLocalDemo();
    const role = sessionStorage.getItem(key);
    return role === "doctor" || role === "assistant" ? role : null;
  },
  signIn(role) {
    requireLocalDemo();
    sessionStorage.setItem(key, role);
  },
  signOut() {
    requireLocalDemo();
    sessionStorage.removeItem(key);
  },
};

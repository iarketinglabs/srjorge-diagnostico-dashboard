export const USERS = ["Pedro Armbrust", "Leticia Suher", "Alexandre Duarte"] as const;

export type UserName = (typeof USERS)[number];

const USER_KEY = "srjorge-dashboard-user";

export function getCurrentUser(): UserName | null {
  const stored = localStorage.getItem(USER_KEY);
  return (USERS as readonly string[]).includes(stored ?? "") ? (stored as UserName) : null;
}

export function setCurrentUser(user: UserName) {
  localStorage.setItem(USER_KEY, user);
}

export function clearCurrentUser() {
  localStorage.removeItem(USER_KEY);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

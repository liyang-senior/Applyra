export type AccountRole = "owner" | "admin" | "user";

export type Account = {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  active: boolean;
  createdAt: string;
};

export function isStaff(role: AccountRole) {
  return role === "owner" || role === "admin";
}

export function canManageAccounts(role: AccountRole) {
  return isStaff(role);
}

export function roleLabel(role: AccountRole) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "User";
}

import { redirect } from "next/navigation";

// Roles & user management moved into Settings (Manage Users / Manage Roles
// tabs). Keep this path working for old links by redirecting.
export default function RolesPage() {
  redirect("/dashboard/settings");
}

import { connection } from "next/server";
import { PlatformAdminDashboard } from "@/components/platform-admin-dashboard";

export default async function PlatformAdminPage() {
  await connection();

  return <PlatformAdminDashboard />;
}

import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentAccount();
  redirect(user ? "/dashboard" : "/signin");
}

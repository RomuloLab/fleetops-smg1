import { redirect } from "next/navigation";
import { getChatGPTUser } from "../chatgpt-auth";
import { getManagerAccess } from "@/lib/manager-access";
import ManagerLogin from "../components/manager-login";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await getManagerAccess()) redirect("/");
  const identity = await getChatGPTUser();
  return <ManagerLogin signedInEmail={identity?.email}/>;
}

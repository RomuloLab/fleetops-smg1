import { getChatGPTUser } from "./chatgpt-auth";
import { getManagerAccess } from "@/lib/manager-access";
import { listCarriers } from "@/lib/carrier-registry";
import { operationDate } from "@/lib/model";
import { CarrierCatalogProvider } from "./components/carrier-catalog";
import Dashboard from "./components/dashboard";
import ManagerLogin from "./components/manager-login";
export const dynamic = "force-dynamic";
export default async function Home() {
  const access = await getManagerAccess();
  if (access) return <CarrierCatalogProvider initialCarriers={await listCarriers()}><Dashboard manager={access} initialDate={operationDate()}/></CarrierCatalogProvider>;
  const identity = await getChatGPTUser();
  return <ManagerLogin signedInEmail={identity?.email}/>;
}

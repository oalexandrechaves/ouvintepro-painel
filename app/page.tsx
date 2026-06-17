import Dashboard from "@/components/Dashboard";
import { getPainelData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getPainelData();
  return <Dashboard data={data} />;
}

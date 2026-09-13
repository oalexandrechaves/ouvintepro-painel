import Ouvintes from "@/components/Ouvintes";
import { exigirAcessoPagina } from "@/lib/acesso/servidor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ouvintes · AtendentePRO" };

export default async function OuvintesPage() {
  await exigirAcessoPagina("ouvintes", "visualizacao");
  return <Ouvintes />;
}

import Audiencia from "@/components/Audiencia";
import { getAudiencia } from "@/lib/serverData";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audiência · OuvintePro",
};

export default async function AudienciaPage() {
  // Carga inicial no servidor, sem filtro: a tela ja abre com numero na tela e
  // com as opcoes preenchidas. Dali em diante quem responde e /api/audiencia.
  const inicial = await getAudiencia({ incluirDemo: true });
  return <Audiencia inicial={inicial} />;
}

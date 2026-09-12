import Comercial from "@/components/Comercial";
import { getAudiencia } from "@/lib/serverData";

export const dynamic = "force-dynamic";
// Leitura completa, sem o corte de 1000 linhas: com o seed de ~50 mil ouvintes
// ela pode passar dos 10 s padrao de funcao da Vercel. 60 s e o teto do plano.
export const maxDuration = 60;
export const metadata = { title: "Comercial · AtendentePRO" };

export default async function ComercialPage() {
  // Carga inicial no servidor, sem filtro: a tela ja abre com numero e com as
  // opcoes preenchidas. Dali em diante quem responde e /api/comercial.
  const inicial = await getAudiencia({ incluirDemo: true });
  return <Comercial inicial={inicial} />;
}

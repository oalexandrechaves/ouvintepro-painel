import Comercial from "@/components/Comercial";
import { getAudiencia } from "@/lib/serverData";

export const dynamic = "force-dynamic";
// Leitura completa, sem o corte de 1000 linhas: com o seed de ~50 mil ouvintes
// ela pode passar dos 10 s padrao de funcao da Vercel. 60 s e o teto do plano.
export const maxDuration = 60;
export const metadata = { title: "Comercial · AtendentePRO" };

export default async function ComercialPage() {
  // Carga inicial no servidor, sem filtro: a tela ja abre com numero e com as
  // opcoes preenchidas. Dali em diante quem responde e /api/comercial. Se a
  // leitura falhar, a tela abre em estado de erro, com "Tentar de novo".
  let inicial: Awaited<ReturnType<typeof getAudiencia>> | null = null;
  try {
    inicial = await getAudiencia({ incluirDemo: true });
  } catch {
    inicial = null;
  }
  return <Comercial inicial={inicial} />;
}

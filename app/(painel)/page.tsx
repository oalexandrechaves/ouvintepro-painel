import VisaoGeral from "@/components/VisaoGeral";
import { getVisaoGeral } from "@/lib/serverData";
import { rangeDoPeriodo } from "@/lib/periodo";

export const dynamic = "force-dynamic";
// Leitura completa, sem o corte de 1000 linhas: com o seed de ~50 mil ouvintes
// ela pode passar dos 10 s padrao de funcao da Vercel. 60 s e o teto do plano.
export const maxDuration = 60;

// Carga inicial no servidor para "30 dias", que e o periodo com que a tela abre:
// o primeiro olhar ja chega com numero, sem esqueleto. Se a leitura falhar, a
// tela abre em estado de erro, com "Tentar de novo", e nunca com zeros.
export default async function Home() {
  const { de, ate } = rangeDoPeriodo("30dias");
  let inicial: Awaited<ReturnType<typeof getVisaoGeral>> | null = null;
  try {
    inicial = await getVisaoGeral(de, ate);
  } catch {
    inicial = null;
  }
  return <VisaoGeral inicial={inicial} />;
}

import Promocoes from "@/components/Promocoes";
import { exigirAcessoPagina } from "@/lib/acesso/servidor";
import { permite } from "@/lib/acesso/modelo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promoções · AtendentePRO" };

export default async function PromocoesPage() {
  const sessao = await exigirAcessoPagina("promocoes", "visualizacao");
  // Sortear e so leitura; confirmar ganhador grava e exige Edicao. O botao some
  // para quem nao pode, e a rota recusa de novo se alguem chamar direto.
  return (
    <Promocoes podeConfirmar={permite(sessao.permissoes, "promocoes", "edicao")} />
  );
}

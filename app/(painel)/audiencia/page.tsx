import { redirect } from "next/navigation";
import { exigirAcessoPagina } from "@/lib/acesso/servidor";

// A tela Audiencia virou Comercial. O endereco antigo redireciona para nao
// quebrar link salvo em favorito ou mandado por mensagem.
export default async function AudienciaAntiga() {
  await exigirAcessoPagina("comercial", "visualizacao");
  redirect("/comercial");
}

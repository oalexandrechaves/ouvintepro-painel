import { redirect } from "next/navigation";

// A tela Audiencia virou Comercial. O endereco antigo redireciona para nao
// quebrar link salvo em favorito ou mandado por mensagem.
export default function AudienciaAntiga() {
  redirect("/comercial");
}

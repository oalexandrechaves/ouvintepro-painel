import { exigirSessaoPagina } from "@/lib/acesso/servidor";
import { primeiraTela } from "@/lib/acesso/destino";
import FormTrocarSenha from "./FormTrocarSenha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trocar senha · AtendentePRO" };

// Fora do layout do painel, como o login: quem ainda tem senha temporaria nao
// abre nenhuma tela e por isso nao ve a barra lateral. Quem troca por vontade
// ganha o link de volta.
export default async function TrocarSenhaPage() {
  const sessao = await exigirSessaoPagina();
  return (
    <FormTrocarSenha
      nome={sessao.nome}
      obrigatoria={sessao.deveTrocarSenha}
      voltarPara={sessao.deveTrocarSenha ? null : primeiraTela(sessao.permissoes)}
    />
  );
}

import Grupos from "@/components/painel-de-controle/Grupos";
import { exigirAcessoPagina } from "@/lib/acesso/servidor";
import { listarGrupos, type GrupoAcesso } from "@/lib/acesso/gestao";
import { permite } from "@/lib/acesso/modelo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grupos de acesso · AtendentePRO" };

export default async function GruposPage() {
  const sessao = await exigirAcessoPagina("painel_de_controle", "visualizacao");
  let inicial: GrupoAcesso[] | null = null;
  try {
    inicial = await listarGrupos(sessao);
  } catch (e) {
    console.error("[grupos] leitura falhou:", e);
    inicial = null;
  }
  return (
    <Grupos
      inicial={inicial}
      podeGerir={permite(sessao.permissoes, "painel_de_controle", "full")}
      meuGrupoId={sessao.grupo.id}
    />
  );
}

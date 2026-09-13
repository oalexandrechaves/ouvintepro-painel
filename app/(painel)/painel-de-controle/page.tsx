import Usuarios, { type DadosUsuarios } from "@/components/painel-de-controle/Usuarios";
import { exigirAcessoPagina } from "@/lib/acesso/servidor";
import { listarGrupos, listarUsuarios } from "@/lib/acesso/gestao";
import { permite } from "@/lib/acesso/modelo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel de Controle · AtendentePRO" };

// Usuarios. Ver exige Visualizacao no Painel de Controle; criar, editar e
// redefinir senha exigem Full (os botoes somem sem Full, e as rotas recusam).
export default async function PainelDeControlePage({
  searchParams,
}: {
  searchParams: { grupo?: string };
}) {
  const sessao = await exigirAcessoPagina("painel_de_controle", "visualizacao");
  let inicial: DadosUsuarios | null = null;
  try {
    const [usuarios, grupos] = await Promise.all([
      listarUsuarios(sessao),
      listarGrupos(sessao),
    ]);
    inicial = { usuarios, grupos };
  } catch (e) {
    console.error("[painel-de-controle] leitura falhou:", e);
    inicial = null;
  }
  const grupo =
    typeof searchParams.grupo === "string" && /^[0-9a-f-]{36}$/i.test(searchParams.grupo)
      ? searchParams.grupo
      : null;
  return (
    <Usuarios
      inicial={inicial}
      podeGerir={permite(sessao.permissoes, "painel_de_controle", "full")}
      meuNivel={sessao.permissoes.painel_de_controle}
      meuId={sessao.id}
      grupoInicial={grupo}
    />
  );
}

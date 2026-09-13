import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";
import { exigirSessaoPagina } from "@/lib/acesso/servidor";
import { MODULOS, ehModulo, nomeDoModulo, permite } from "@/lib/acesso/modelo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sem acesso · AtendentePRO" };

// Para onde o middleware manda quem abriu uma tela que o grupo nao permite.
// Diz qual modulo, qual grupo, e o que a pessoa pode abrir.
export default async function SemAcessoPage({
  searchParams,
}: {
  searchParams: { modulo?: string };
}) {
  const sessao = await exigirSessaoPagina();
  const modulo = ehModulo(searchParams.modulo) ? searchParams.modulo : null;
  const abertos = MODULOS.filter(
    (m) => m.chave !== "atendimentos" && permite(sessao.permissoes, m.chave, "visualizacao"),
  );

  return (
    <>
      <Cabecalho tela="Sem acesso" />
      <div className="cartao mt-7 max-w-xl p-6">
        <p className="text-[15px] text-texto-titulo">
          {modulo
            ? `O grupo ${sessao.grupo.nome} não tem acesso a ${nomeDoModulo(modulo)}.`
            : `O grupo ${sessao.grupo.nome} não tem acesso a esta tela.`}
          {sessao.grupo.ativo ? "" : " O grupo está inativo, e grupo inativo não abre nenhum módulo."}
        </p>
        <p className="mt-2 text-[13.5px] text-texto-corpo">
          Quem muda o acesso é um administrador, no Painel de Controle.
        </p>
        {abertos.length ? (
          <div className="mt-5">
            <div className="rotulo-mono mb-2">Você pode abrir</div>
            <div className="flex flex-wrap gap-2">
              {abertos.map((m) => (
                <Link key={m.chave} href={m.href} className="botao-secundario">
                  {m.nome}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-5 text-[13.5px] text-texto-forte">
            Hoje o seu grupo não abre nenhum módulo.
          </p>
        )}
      </div>
    </>
  );
}

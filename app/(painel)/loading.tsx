import { EsqueletoCartoes, EsqueletoLista } from "@/components/ui";

// CARREGAMENTO DA NAVEGACAO ENTRE TELAS.
// As telas leem dezenas de milhares de linhas no servidor antes de responder, e
// sem este arquivo o clique no menu deixava a tela anterior parada por 20 a 40
// segundos, sem sinal nenhum: numa reuniao, parece sistema travado. Com ele o
// Next troca o conteudo por este esqueleto no instante do clique; a barra
// lateral fica, porque o layout do grupo nao e recarregado.
export default function Carregando() {
  return (
    <div aria-busy="true" aria-label="Carregando a tela" className="pt-5">
      <div className="esqueleto h-3 w-[140px] rounded-md" />
      <div className="esqueleto mt-4 h-8 w-[260px] rounded-[10px]" />
      <div className="esqueleto mt-3 h-3 w-[340px] max-w-full rounded-md" />
      <div className="max-w-[1240px] pt-10">
        <EsqueletoCartoes />
        <div className="mt-[18px] grid grid-cols-1 gap-[18px] md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cartao p-[22px]">
              <EsqueletoLista />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

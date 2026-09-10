"use client";

import { useState } from "react";

// PECA DE EXEMPLO DA CAMPANHA: o que o comercial deixa com o cliente na reuniao.
//
// FORMATO: previa na tela + window.print(), e nao geracao de PDF por biblioteca.
// O dialogo de impressao do navegador ja tem "Salvar como PDF" em todo sistema,
// entao um botao atende imprimir E baixar. jsPDF/pdfmake custariam dependencia
// nova e, com acentuacao em portugues, exigiriam embutir fonte (sem isso
// "Delicia" sai "Delcia"). O recorte do que vai para o papel esta no
// @media print do globals.css, ancorado na classe .print-area.
//
// O DOCUMENTO MOSTRA A PECA, NUNCA A LISTA DE OUVINTES. A lista e prova interna
// de que o publico existe; a peca e o que vai para a casa da pessoa.
export default function DocumentoCampanha({
  bairro,
  totalPublico,
  onFechar,
}: {
  bairro: string | null;
  totalPublico: number;
  onFechar: () => void;
}) {
  const [anunciante, setAnunciante] = useState("Pizzaria Delícia");
  const [oferta, setOferta] = useState(
    "30% de desconto na primeira pizza grande, de segunda a quinta.",
  );
  const [cupom, setCupom] = useState("LIVERPOOL30");

  const regiao = bairro ?? "sua região";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={onFechar}
    >
      <div
        className="flex w-full max-w-3xl flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Controles: no-print, nao vao para o papel */}
        <div className="no-print glass flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg text-mist-50">
              Peça de exemplo da campanha
            </h3>
            <button
              onClick={onFechar}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-mist-300 hover:text-mist-50"
            >
              Fechar
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-mist-400">
                Anunciante
              </span>
              <input
                value={anunciante}
                onChange={(e) => setAnunciante(e.target.value)}
                className="rounded-lg border border-white/10 bg-ink-850/60 px-3 py-2 text-sm text-mist-50 outline-none focus:border-neon-violet/50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-mist-400">
                Código do cupom
              </span>
              <input
                value={cupom}
                onChange={(e) => setCupom(e.target.value.toUpperCase())}
                className="rounded-lg border border-white/10 bg-ink-850/60 px-3 py-2 text-sm text-mist-50 outline-none focus:border-neon-violet/50"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] uppercase tracking-wide text-mist-400">
                Texto da oferta
              </span>
              <textarea
                value={oferta}
                onChange={(e) => setOferta(e.target.value)}
                rows={2}
                className="resize-none rounded-lg border border-white/10 bg-ink-850/60 px-3 py-2 text-sm text-mist-50 outline-none focus:border-neon-violet/50"
              />
            </label>
          </div>
          <button
            onClick={() => window.print()}
            className="self-start rounded-xl bg-gradient-to-r from-neon-pink to-neon-violet px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-neon-violet/20"
          >
            Imprimir ou salvar em PDF
          </button>
          <p className="text-[11px] text-mist-400">
            No diálogo de impressão, escolha &quot;Salvar como PDF&quot; para
            gerar o arquivo.
          </p>
        </div>

        {/* A PECA. Fundo claro de proposito: e papel, não interface. */}
        <div className="print-area rounded-2xl bg-[#FBFAF7] p-8 text-[#1A1A1A] shadow-2xl sm:p-12">
          <div className="flex items-start justify-between border-b border-[#D32029]/30 pb-5">
            <div className="flex flex-col">
              <span className="font-display text-2xl font-black italic tracking-tight">
                Rádio <span className="text-[#D32029]">Liverpool</span>
              </span>
              <span className="text-[11px] uppercase tracking-widest text-[#6B6B6B]">
                FM · São Paulo
              </span>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-widest text-[#6B6B6B]">
                em parceria com
              </div>
              <div className="font-display text-lg font-bold">{anunciante}</div>
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-4 text-sm leading-relaxed">
            <p className="font-display text-xl font-bold">
              Um presente da sua rádio para {regiao}.
            </p>
            <p>
              Você é ouvinte da Rádio Liverpool, e é por isso que esta carta
              chegou até a sua casa. A gente juntou com a {anunciante} para
              trazer uma oferta exclusiva para quem mora{" "}
              {regiao === "sua região" ? "aqui perto" : `no ${regiao}`}.
            </p>
            <p className="font-semibold">{oferta}</p>

            <div className="my-2 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#D32029] bg-white px-6 py-6">
              <span className="text-[11px] uppercase tracking-widest text-[#6B6B6B]">
                Apresente este cupom
              </span>
              <span className="font-display text-3xl font-black tracking-wider text-[#D32029]">
                {cupom}
              </span>
              <span className="text-[11px] text-[#6B6B6B]">
                Válido enquanto durar a campanha.
              </span>
            </div>

            <p>
              Continue ligado na Rádio Liverpool. É por aqui que a gente avisa
              das promoções, toca o seu pedido e manda o seu recado no ar.
            </p>
            <p className="text-[#6B6B6B]">
              Um abraço,
              <br />
              Equipe Rádio Liverpool
            </p>
          </div>

          <div className="mt-8 border-t border-[#E0DED9] pt-4 text-[10px] leading-relaxed text-[#6B6B6B]">
            Esta correspondência faz parte de uma campanha da Rádio Liverpool em
            parceria com {anunciante}. O endereço utilizado para esta entrega é
            de cadastro da própria rádio, informado por você e mantido sob a
            LGPD. A {anunciante} não recebe os seus dados. Para sair da lista,
            fale com a rádio pelo WhatsApp.
          </div>
        </div>

        <p className="no-print text-center text-[11px] text-mist-400">
          Peça de exemplo. O público selecionado hoje é de{" "}
          {totalPublico.toLocaleString("pt-BR")} ouvintes.
        </p>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FormTrocarSenha({
  nome,
  obrigatoria,
  voltarPara,
}: {
  nome: string;
  obrigatoria: boolean;
  voltarPara: string | null;
}) {
  const router = useRouter();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (nova.length < 8) {
      setErro("A senha nova precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (nova !== confirma) {
      setErro("A confirmação não é igual à senha nova.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/sessao/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atual, nova }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.destino === "string") {
        router.replace(data.destino);
        router.refresh();
        return;
      }
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      setErro(
        typeof data.erro === "string" && res.status !== 500
          ? data.erro
          : "Não foi possível trocar a senha agora. Nada foi alterado; tente de novo.",
      );
    } catch {
      setErro("Sem conexão com o servidor. Nada foi alterado; tente de novo.");
    }
    setEnviando(false);
  }

  const campo = "campo px-3.5 py-2.5";

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <main className="w-full max-w-sm animate-pop">
        <div className="cartao p-7 sm:p-8">
          <div className="font-display text-[22px] font-semibold leading-tight tracking-[-0.02em]">
            {obrigatoria ? "Crie a sua senha" : "Trocar senha"}
          </div>
          <p className="mt-2 text-[13.5px] text-texto-corpo">
            {obrigatoria
              ? `${nome}, a senha que você usou é temporária. Escolha uma senha sua para abrir o painel.`
              : "Depois da troca, outros aparelhos em que você está logado pedem a senha de novo."}
          </p>

          <form onSubmit={enviar} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="atual" className="rotulo-mono">
                {obrigatoria ? "Senha temporária" : "Senha atual"}
              </label>
              <input id="atual" type="password" autoComplete="current-password" required
                value={atual} onChange={(e) => setAtual(e.target.value)} className={campo} />
            </div>
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="nova" className="rotulo-mono">Senha nova</label>
              <input id="nova" type="password" autoComplete="new-password" required minLength={8}
                value={nova} onChange={(e) => setNova(e.target.value)} className={campo} />
              <span className="text-[12px] text-texto-rotulo">Pelo menos 8 caracteres.</span>
            </div>
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="confirma" className="rotulo-mono">Repita a senha nova</label>
              <input id="confirma" type="password" autoComplete="new-password" required
                value={confirma} onChange={(e) => setConfirma(e.target.value)} className={campo} />
            </div>

            {erro ? (
              <p role="alert" className="animate-fadeIn text-[13px] text-magenta">{erro}</p>
            ) : null}

            <button type="submit" disabled={enviando} className="botao-primario mt-1 py-2.5 text-sm">
              {enviando ? "Salvando..." : "Salvar senha"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-[13px]">
            {voltarPara ? (
              <Link href={voltarPara} className="text-texto-corpo hover:text-magenta">
                ← Voltar ao painel
              </Link>
            ) : (
              <span />
            )}
            <form action="/api/logout" method="post">
              <button type="submit" className="text-texto-corpo hover:text-magenta">
                Sair
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro ?? "Usuário ou senha incorretos");
        setLoading(false);
      }
    } catch {
      setErro("Não foi possível conectar. Tente de novo.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <main className="w-full max-w-sm animate-pop">
        <div className="cartao p-7 sm:p-8">
          {/* Marca tipografica, como no arquivo de referencia: nao e imagem. */}
          <div className="text-center">
            <div className="font-display text-[30px] leading-none tracking-[-0.02em]">
              <span className="font-medium text-texto-titulo">Atendente</span>
              <span className="font-bold text-magenta">PRO</span>
            </div>
            <div className="rotulo-mono mt-2.5 tracking-[0.14em]">
              Rádio Liverpool
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="user" className="rotulo-mono">
                Usuário
              </label>
              <input
                id="user"
                type="text"
                autoComplete="username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                required
                className="campo px-3.5 py-2.5 placeholder:text-texto-off"
                placeholder="seu usuário"
              />
            </div>

            <div className="flex flex-col gap-[7px]">
              <label htmlFor="password" className="rotulo-mono">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="campo px-3.5 py-2.5 placeholder:text-texto-off"
                placeholder="sua senha"
              />
            </div>

            {erro ? (
              <p
                role="alert"
                className="animate-fadeIn text-[13px] text-magenta"
              >
                {erro}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="botao-primario mt-1 py-2.5 text-sm"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-texto-rotulo">
          AtendentePRO · Rádio Liverpool
        </p>
      </main>
    </div>
  );
}

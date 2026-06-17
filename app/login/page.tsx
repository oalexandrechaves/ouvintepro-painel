"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Background from "@/components/Background";

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
        setErro(data.erro ?? "Usuario ou senha incorretos");
        setLoading(false);
      }
    } catch {
      setErro("Nao foi possivel conectar. Tente de novo.");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-grid px-5 py-10">
      <Background />

      <main className="relative z-10 w-full max-w-sm">
        <div className="glass p-7 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-ink-850">
              <Image
                src="/ouvintepro.PNG"
                alt="Logo OuvintePro"
                fill
                sizes="56px"
                className="object-contain p-2"
                priority
              />
            </div>
            <h1 className="mt-4 font-display text-3xl font-bold">
              <span className="text-gradient">OuvintePro</span>
            </h1>
            <p className="mt-1 text-sm text-mist-300">Dados e Conexao na Radio</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="user" className="text-xs text-mist-300">
                Usuario
              </label>
              <input
                id="user"
                type="text"
                autoComplete="username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                required
                className="rounded-xl border border-white/10 bg-ink-900/60 px-4 py-2.5 text-sm text-mist-50 outline-none transition-colors placeholder:text-mist-400 focus:border-neon-violet/60"
                placeholder="seu usuario"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs text-mist-300">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-xl border border-white/10 bg-ink-900/60 px-4 py-2.5 text-sm text-mist-50 outline-none transition-colors placeholder:text-mist-400 focus:border-neon-violet/60"
                placeholder="sua senha"
              />
            </div>

            {erro ? (
              <p className="text-sm text-neon-pink">{erro}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-xl bg-gradient-to-r from-neon-pink to-neon-violet px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-neon-violet/20 transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-mist-400">
          OuvintePro · Dados e Conexao na Radio
        </p>
      </main>
    </div>
  );
}

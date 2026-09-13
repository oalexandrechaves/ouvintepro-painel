// BUSCA DO NAVEGADOR: RESPOSTA QUE NAO E SUCESSO E ERRO, NUNCA DADO VAZIO.
// As telas faziam `r.ok ? r.json() : null` e tratavam o null como "nao tem":
// falha de rede ou HTTP 500 virava "Nenhuma promoção ativa", "Sem conversa
// registrada" ou deixava o numero anterior na tela sob o filtro novo. Aqui
// qualquer falha (rede, status fora de 2xx, corpo que nao e JSON) LANCA, e cada
// tela decide mostrar o estado de erro com "Tentar de novo".
//
// Sessao vencida ou derrubada (401): vai para o login, em vez de mostrar erro
// numa tela que ja nao pode carregar nada. Sem permissao (403) e regra recusada
// (422) lancam com a mensagem do servidor, que a tela pode mostrar.
export class ErroDaBusca extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDaBusca";
  }
}

async function mensagemDe(r: Response): Promise<string | null> {
  try {
    const d = (await r.json()) as { erro?: unknown };
    return typeof d?.erro === "string" ? d.erro : null;
  } catch {
    return null;
  }
}

export async function enviarJson<T>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      cache: "no-store",
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ErroDaBusca(0, "Sem conexão com o servidor.");
  }
  if (r.status === 401) {
    window.location.assign("/login");
    throw new ErroDaBusca(401, "Sessão expirada. Entre de novo.");
  }
  if (!r.ok) {
    const m = r.status === 403 || r.status === 422 ? await mensagemDe(r) : null;
    throw new ErroDaBusca(r.status, m ?? `O servidor respondeu ${r.status}.`);
  }
  return (await r.json()) as T;
}

export async function buscarJson<T>(url: string): Promise<T> {
  return enviarJson<T>(url);
}

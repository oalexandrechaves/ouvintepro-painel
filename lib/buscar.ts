// BUSCA DO NAVEGADOR: RESPOSTA QUE NAO E SUCESSO E ERRO, NUNCA DADO VAZIO.
// As telas faziam `r.ok ? r.json() : null` e tratavam o null como "nao tem":
// falha de rede ou HTTP 500 virava "Nenhuma promoção ativa", "Sem conversa
// registrada" ou deixava o numero anterior na tela sob o filtro novo. Aqui
// qualquer falha (rede, status fora de 2xx, corpo que nao e JSON) LANCA, e cada
// tela decide mostrar o estado de erro com "Tentar de novo".
export async function buscarJson<T>(url: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error("Sem conexão com o servidor.");
  }
  if (!r.ok) throw new Error(`O servidor respondeu ${r.status}.`);
  return (await r.json()) as T;
}

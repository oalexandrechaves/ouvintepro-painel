import { MODULOS, permite, type Permissoes } from "./modelo";

// Primeira tela que o usuario pode abrir, na ordem da barra lateral. Atendimentos
// ainda nao tem tela e fica de fora. Sem nenhuma: /sem-acesso, que explica.
export function primeiraTela(p: Permissoes): string {
  const m = MODULOS.find(
    (x) => x.chave !== "atendimentos" && permite(p, x.chave, "visualizacao"),
  );
  return m ? m.href : "/sem-acesso";
}

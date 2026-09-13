// CONFERENCIA DO MAPA DE ROTAS. Roda antes de todo build (npm run build) e
// DERRUBA o build se achar rota sem dono.
//
// O middleware nega o que nao esta em lib/acesso/rotas.ts. Isso protege, mas uma
// tela nova esquecida no mapa so apareceria como 404 em producao. Aqui o erro
// aparece antes do deploy. Confere tres coisas:
//  1. toda page.tsx e todo metodo exportado por route.ts tem regra no mapa;
//  2. toda regra do mapa aponta para uma tela ou rota que existe (mapa velho
//     tambem e erro: esconde o que ninguem mais usa);
//  3. toda tela e rota que nao e publica chama a conferencia de sessao da
//     segunda camada (exigirAcessoPagina/exigirSessaoPagina nas telas,
//     exigirAcesso/exigirSessao nas rotas).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const raiz = new URL("..", import.meta.url).pathname;

const fonte = readFileSync(join(raiz, "lib/acesso/rotas.ts"), "utf8");
const js = ts.transpileModule(fonte, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { ROTAS, regraDaRota } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : [p];
  });
}

const erros = [];
const usadas = new Set();

for (const arq of arquivos(join(raiz, "app"))) {
  const nome = arq.split(sep).pop();
  if (nome !== "page.tsx" && nome !== "route.ts") continue;
  const segmentos = relative(join(raiz, "app"), arq)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
    .map((s) => (s.startsWith("[") ? "exemplo" : s));
  const caminho = "/" + segmentos.join("/");
  const texto = readFileSync(arq, "utf8");
  const metodos =
    nome === "page.tsx"
      ? ["GET"]
      : [...texto.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]);
  if (!metodos.length) erros.push(`${caminho}: route.ts sem metodo exportado reconhecido`);

  let publica = true;
  for (const metodo of metodos) {
    const regra = regraDaRota(caminho, metodo);
    if (!regra) {
      erros.push(`${metodo} ${caminho}: sem regra em lib/acesso/rotas.ts (o middleware nega)`);
      continue;
    }
    usadas.add(`${metodo} ${caminho}`);
    if (regra.tipo !== "publica") publica = false;
  }
  if (publica) continue;
  const conferencia =
    nome === "page.tsx"
      ? /exigir(Acesso|Sessao)Pagina\(/
      : /exigir(Acesso|Sessao)\(/;
  if (!conferencia.test(texto)) {
    erros.push(`${caminho} (${nome}): nao chama ${nome === "page.tsx" ? "exigirAcessoPagina/exigirSessaoPagina" : "exigirAcesso/exigirSessao"}`);
  }
}

for (const [caminho, regras] of Object.entries(ROTAS)) {
  for (const metodo of Object.keys(regras)) {
    if (!usadas.has(`${metodo} ${caminho}`)) {
      erros.push(`${metodo} ${caminho}: regra no mapa sem tela ou rota correspondente`);
    }
  }
}

if (erros.length) {
  console.error("\nMAPA DE ROTAS COM PROBLEMA:\n - " + erros.join("\n - ") + "\n");
  process.exit(1);
}
console.log(`Mapa de rotas conferido: ${usadas.size} rotas com regra, nenhuma sem dono.`);

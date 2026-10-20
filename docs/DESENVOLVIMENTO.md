# Guia de desenvolvimento

Detalhes técnicos do Cantinho: como rodar, testar, publicar e como os dados são guardados.
Para uma visão geral do projeto, veja o [README](../README.md).

| Camada    | Tecnologia                                                       |
| --------- | ---------------------------------------------------------------- |
| Front-end | React 19 + Vite + TypeScript, Tailwind CSS 4                     |
| API       | Cloudflare Worker (Hono + TypeScript), no mesmo endereço do site |
| Banco     | PostgreSQL no Supabase, acessado pelo Hyperdrive da Cloudflare   |
| Testes    | Vitest + Testing Library (front), Vitest contra o Postgres (API) |

```
cantinho/
├── .env              # DATABASE_URL e JWT_SECRET (não vai para o git; modelo em .env.example)
├── .env.example      # modelo do .env
├── dev.ps1           # abre o Worker e o Vite juntos para desenvolver
├── frontend/         # React + Vite  → compila para frontend/dist
└── worker/           # Cloudflare Worker: serve frontend/dist e a API em /api/*
    ├── src/          # rotas, login, repositório (SQL), validação
    ├── migrations/   # SQL do banco
    ├── scripts/      # db:migrate (aplica as migrations) e dev-vars (prepara o .dev.vars local)
    ├── test/
    └── wrangler.jsonc  # configuração do Worker (Hyperdrive, variáveis, site estático)
```

## Primeira vez

1. Copie `.env.example` para **`.env`** na raiz e preencha `DATABASE_URL` (a string de conexão do
   Supabase, com a senha real) e `JWT_SECRET` (gere com
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`).
   Se a senha tiver `@ : / # ? %`, codifique-os (`@` → `%40`).
2. `cd frontend && npm install` e `cd ../worker && npm install` (Node 20+).
3. Crie as tabelas no Supabase: `cd worker && npm run db:migrate` (só aplica o que falta).

## Rodar em desenvolvimento

```powershell
.\dev.ps1     # abre os dois e o site fica em http://localhost:5173
```

Ou à mão, em dois terminais: `cd worker; npm run dev` (API em :8787) e `cd frontend; npm run dev`
(site em :5173, que encaminha `/api` para o Worker). O Worker local conecta direto no Supabase.

## Testes e verificações

```powershell
cd frontend; npm test; npm run typecheck; npm run lint; npm run build
cd worker;   npm test; npm run typecheck
```

Os testes da API rodam no Postgres do Supabase, cada arquivo num schema temporário apagado no fim;
as tabelas reais (`public`) não são tocadas.

## Publicar na Cloudflare

Tudo sai de um único Worker (site + API), então o cookie de login funciona sem configuração extra.

```powershell
cd worker
npx wrangler login                                   # abre o navegador para autorizar
# 1) pool de conexões com o Supabase:
npx wrangler hyperdrive create cantinho-db --connection-string="postgresql://postgres.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
#    copie o "id" mostrado e coloque em worker/wrangler.jsonc (hyperdrive → id)
# 2) a chave da sessão (cole o JWT_SECRET do .env quando pedir):
npx wrangler secret put JWT_SECRET
# 3) compila o site e publica:
npm run deploy
```

O endereço final aparece no fim (`https://cantinho.<sua-conta>.workers.dev`). O cadastro fica aberto
(`ALLOW_REGISTRATION`) até um teto de contas (`MAX_USERS`, padrão 1000), para não encher o banco
gratuito. Para fechá-lo, ponha `"ALLOW_REGISTRATION": "false"` em `vars` no `wrangler.jsonc`.

**Publicação automática:** com o repositório conectado em Workers & Pages → Settings → Builds
(build `npm --prefix frontend ci && npm --prefix frontend run build && npm --prefix worker ci`, deploy
`npx wrangler deploy --config worker/wrangler.jsonc`), cada `git push` na `main` publica o site.

## Limites dos planos gratuitos

O site roda nos planos gratuitos da Cloudflare e do Supabase. Quando um limite estoura, o app não
fica em branco: mostra o motivo e continua funcionando com os dados salvos no aparelho.

| Situação                                                                                                                  | O que acontece                                               | Mensagem                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Cota diária de requisições (100 mil/dia) ou CPU do Worker excedidos (erros 1027/1102 da Cloudflare, HTTP 429/5xx em HTML) | O site (arquivos estáticos) continua abrindo; só a API falha | "O servidor atingiu o limite de uso do plano gratuito da Cloudflare… reinicia por volta das 21h (Brasília)" |
| Banco do Supabase pausado por inatividade, sem conexões ou fora do ar                                                     | API responde `503` com `code: db_unavailable`                | "O banco de dados está indisponível… pode estar pausado por inatividade"                                    |
| Teto de contas atingido                                                                                                   | `403` com `code: users_limit`                                | "O limite de contas deste site foi atingido"                                                                |
| Sem internet                                                                                                              | —                                                            | "Sem conexão com o servidor"                                                                                |

No login o erro aparece sob o formulário; dentro do app, como um aviso fixo no topo (e um balão) que
some sozinho quando a conexão volta. O app tenta salvar de novo com espera crescente (até ~1 min)
para não martelar um servidor sem cota. Um banco pausado do Supabase volta pelo painel do Supabase
(botão _Restore_).

O hash da senha (PBKDF2, 100 mil iterações, ~20 ms) cabe na cota de CPU do plano gratuito nos
testes feitos. Se um dia aparecer o erro 1102 ao entrar, as saídas são o plano Workers Paid
(US$ 5/mês) ou trocar o login para o Supabase Auth.

## Como os dados são salvos

Tabelas relacionais no PostgreSQL:

| Tabela             | Conteúdo                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`            | contas (usuário em minúsculas, senha com hash PBKDF2-SHA256 e sal)                                                                                    |
| `areas`            | nome, emoji, periodicidade (`interval_days` ou `weekly_days` + `weekly_time`), última checagem, ordem                                                |
| `area_checks`      | histórico de checagens (FK → `areas`, cascade)                                                                                                       |
| `tasks`            | título, quadrante, prazo, notas. FK → `areas` e → `events` com `ON DELETE SET NULL`: **apagar uma área não apaga as tarefas, elas ficam "sem área"** |
| `events`           | compromissos (data, horário, dia inteiro, repetição)                                                                                                 |
| `event_done_dates` | dias concluídos de compromissos que se repetem (FK → `events`)                                                                                       |
| `list_items`       | Indicações e Hobbies                                                                                                                                 |
| `missed_events`    | compromissos (ou dias de um que se repete) que passaram sem ser marcados como feitos; ficam na Bora até a exclusão ser confirmada                   |
| `user_state`       | dia da última repriorização das tarefas (uma linha por usuário)                                                                                      |
| `water`            | meta e contagem de copos do dia (uma linha por usuário)                                                                                              |

Toda linha pertence a um usuário (`user_id`, chave primária composta `user_id + id`): cada conta só
vê os próprios dados. Há `CHECK`s e chaves estrangeiras para os valores válidos, e **Row Level
Security ligado e sem policies**: a API REST pública do Supabase (anon key) não enxerga nada.

A API (`GET/PUT /api/state`) recebe e devolve o estado do app como um todo; o Worker o decompõe em
linhas numa transação (cria, atualiza e remove o que mudou). A interface grava no aparelho
(`localStorage`) na hora e envia ao servidor ~0,5 s depois; na primeira conexão de um aparelho com
dados locais, o que existe só nele é juntado ao que já está na conta. Se a API estiver fora do ar,
o app continua funcionando e avisa uma vez que os dados ficam só neste aparelho.

## Login

- Criar conta e entrar com usuário (3 a 30 letras, números, ponto, hífen ou _) e senha (mínimo 8 caracteres); botão **Sair** no topo.
- A sessão é um JWT num cookie `httpOnly` + `SameSite=Lax` (30 dias; muda com `SESSION_DAYS`),
  assinado com `JWT_SECRET`.
  O JavaScript da página nunca enxerga o token. Trocar o `JWT_SECRET` desloga todo mundo.
- O erro de login é o mesmo para usuário inexistente e senha errada.
- Ao sair, a cópia local dos dados daquela conta é apagada do navegador.

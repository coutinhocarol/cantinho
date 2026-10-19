# Cantinho

Organizador de rotina: **Bora** (o que fazer hoje), **Tarefas** (por área e matriz de priorização),
**Calendário**, **Coisinhas** (listas) e **Áreas** (rotinas com periodicidade).
Visual e regras são os do protótipo `Cantinho.html`, agora como projeto completo.

**Site no ar:** https://cantinho.coutinhoucarol.workers.dev (o cadastro está fechado; este é um app pessoal).

| Camada | Tecnologia |
| --- | --- |
| Front-end | React 19 + Vite + TypeScript, Tailwind CSS 4 |
| API | Cloudflare Worker (Hono + TypeScript), no mesmo endereço do site |
| Banco | PostgreSQL no Supabase, acessado pelo Hyperdrive da Cloudflare |
| Testes | Vitest + Testing Library (front), Vitest contra o Postgres (API) |

```
cantinho/
├── .env              # DATABASE_URL e JWT_SECRET (não vai para o git)
├── frontend/         # React + Vite  → compila para frontend/dist
├── worker/           # Cloudflare Worker: serve frontend/dist e a API em /api/*
│   ├── src/          # rotas, login, repositório (SQL), validação
│   ├── migrations/   # SQL do banco
│   └── test/
└── legacy-fastapi/   # primeira versão da API em Python (não é mais usada; pode apagar)
```

## Primeira vez

1. **`.env`** na raiz, com `DATABASE_URL` (senha real do Supabase no lugar de `[YOUR-PASSWORD]`) e
   `JWT_SECRET` (gere com `python -c "import secrets;print(secrets.token_urlsafe(48))"`).
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
# 1) pool de conexões com o Supabase (use postgresql://, sem "+psycopg"):
npx wrangler hyperdrive create cantinho-db --connection-string="postgresql://postgres.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
#    copie o "id" mostrado e coloque em worker/wrangler.jsonc (hyperdrive → id)
# 2) a chave da sessão (cole o JWT_SECRET do .env quando pedir):
npx wrangler secret put JWT_SECRET
# 3) compila o site e publica:
npm run deploy
```

O endereço final aparece no fim (`https://cantinho.<sua-conta>.workers.dev`). Depois de criar a sua
conta, feche o cadastro: em `wrangler.jsonc`, `"vars": { "ALLOW_REGISTRATION": "false", ... }`, e
publique de novo.

**Atenção ao limite de CPU.** O plano gratuito dos Workers dá ~10 ms de CPU por requisição e o hash
da senha (PBKDF2, 100 mil iterações, ~20 ms) pode estourar no cadastro e no login. Se aparecer erro
1102 ao entrar, use o plano Workers Paid (US$ 5/mês) ou me peça para trocar o login para o
Supabase Auth, que faz o hash fora do Worker.

## Como os dados são salvos

Tabelas relacionais no PostgreSQL:

| Tabela | Conteúdo |
| --- | --- |
| `users` | contas (e-mail em minúsculas, senha com hash PBKDF2-SHA256 e sal) |
| `areas` | nome, emoji, periodicidade (`interval_days` ou `weekly_days` + `weekly_time`), última checagem, ordem |
| `area_checks` | histórico de checagens (FK → `areas`, cascade) |
| `tasks` | título, quadrante, prazo, notas. FK → `areas` e → `events` com `ON DELETE SET NULL`: **apagar uma área não apaga as tarefas, elas ficam "sem área"** |
| `events` | compromissos (data, horário, dia inteiro, repetição) |
| `event_done_dates` | dias concluídos de compromissos que se repetem (FK → `events`) |
| `list_items` | Compras, Indicações e Hobbies |
| `water` | meta e contagem de copos do dia (uma linha por usuário) |

Toda linha pertence a um usuário (`user_id`, chave primária composta `user_id + id`): cada conta só
vê os próprios dados. Há `CHECK`s e chaves estrangeiras para os valores válidos, e **Row Level
Security ligado e sem policies**: a API REST pública do Supabase (anon key) não enxerga nada.

A API (`GET/PUT /api/state`) recebe e devolve o estado do app como um todo; o Worker o decompõe em
linhas numa transação (cria, atualiza e remove o que mudou). A interface grava no aparelho
(`localStorage`) na hora e envia ao servidor ~0,5 s depois; na primeira conexão de um aparelho com
dados locais, o que existe só nele é juntado ao que já está na conta. Se a API estiver fora do ar,
o app continua funcionando e avisa uma vez que os dados ficam só neste aparelho.

## Login

- Criar conta e entrar com e-mail e senha (mínimo 8 caracteres); botão **Sair** no topo.
- A sessão é um JWT num cookie `httpOnly` + `SameSite=Lax` (30 dias), assinado com `JWT_SECRET`.
  O JavaScript da página nunca enxerga o token. Trocar o `JWT_SECRET` desloga todo mundo.
- O erro de login é o mesmo para e-mail inexistente e senha errada.
- Ao sair, a cópia local dos dados daquela conta é apagada do navegador.

## Notas de implementação

- O CSS do protótipo foi mantido como está (`frontend/src/styles/cantinho.css`); o Tailwind entra com
  prefixo `tw:` (sem preflight) para ajustes pontuais, sem colidir com as classes do design.
- A classe `.ring` do protótipo virou `.area-ring` por colidir com um utilitário do Tailwind.

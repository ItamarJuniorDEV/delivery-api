# Delivery API

API REST para cadastro de usuários e acompanhamento de entregas. O projeto usa autenticação JWT, autorização por papel e histórico de eventos de entrega com PostgreSQL e Prisma.

## Funcionalidades

- cadastro e autenticação de usuários;
- papéis `customer` e `sale`;
- criação e listagem de entregas por vendedores;
- atualização de status (`processing`, `shipped`, `delivered`);
- gravação do status e do respectivo log na mesma transação;
- consulta do histórico pelo cliente dono da entrega ou por vendedores;
- registro manual de eventos por vendedores;
- rate limiting no endpoint de sessão;
- documentação HTTP com Swagger UI.

## Stack

- Node.js 20+
- TypeScript
- Express
- Prisma ORM
- PostgreSQL
- Zod
- JWT e bcrypt
- Jest e Supertest

## Como executar

```bash
git clone https://github.com/ItamarJuniorDEV/delivery-api.git
cd delivery-api
npm install
cp .env-example .env
```

Configure o `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/api-delivery?schema=public"
JWT_SECRET="uma-chave-local"
```

Com PostgreSQL disponível, aplique as migrations e inicie a API:

```bash
npx prisma migrate deploy
npm run dev
```

A aplicação sobe em `http://localhost:3333` e a documentação Swagger fica em `/api-docs`.

## Endpoints principais

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| POST | `/users` | público | Cadastra usuário |
| POST | `/sessions` | público | Autentica e retorna JWT |
| POST | `/deliveries` | `sale` | Cria entrega |
| GET | `/deliveries` | `sale` | Lista entregas |
| PATCH | `/deliveries/:id/status` | `sale` | Atualiza status e registra log |
| POST | `/delivery-logs` | `sale` | Registra evento manual |
| GET | `/delivery-logs/:delivery_id/show` | `sale` / `customer` | Retorna entrega e histórico; clientes só acessam as próprias |

## Testes

A suíte usa Jest, Supertest e um banco PostgreSQL. Além de cadastro e sessão, cobre criação de entrega, atualização de status, histórico, autorização por proprietário e rollback quando a gravação do log falha.

```bash
npm test
```

Para validar apenas o TypeScript:

```bash
npm run typecheck
```

Os workflows de CI executam os testes com PostgreSQL e a verificação de tipos. O workflow de segurança executa auditoria das dependências de produção e varredura do histórico com Gitleaks.

## Licença

MIT. Consulte o arquivo `LICENSE`.

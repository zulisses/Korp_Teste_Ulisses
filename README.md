# Korp - Sistema de Notas Fiscais

Sistema finalizado para controle operacional de produtos, estoque, reservas e notas fiscais. O projeto integra uma interface ERP desktop-first a dois microsserviços independentes, com persistência PostgreSQL, idempotência e proteção contra reservas concorrentes.

## Status

Versão final concluída e validada. O escopo entregue contempla o fluxo completo de cadastro de produtos, movimentação de estoque, criação e edição de notas, reserva de itens, cancelamento, fechamento e impressão operacional.

## Arquitetura

- `frontend`: Angular 22 e Angular Material;
- `StockService`: ASP.NET Core, EF Core e Npgsql;
- `BillingService`: ASP.NET Core, EF Core e Npgsql;
- PostgreSQL exclusivo para o Estoque;
- PostgreSQL exclusivo para o Faturamento;
- comunicação HTTP síncrona do Faturamento para o Estoque;
- Nginx como servidor e proxy das APIs no contêiner do frontend.

## Serviços

- Frontend: `http://localhost:4200`
- Estoque: `http://localhost:8081`
- Faturamento: `http://localhost:8082`
- PostgreSQL do Estoque: `localhost:5433`
- PostgreSQL do Faturamento: `localhost:5434`

## Execução

```bash
docker compose up --build -d
```

O comando sobe os cinco contêineres do ambiente: frontend, dois microsserviços e dois PostgreSQL independentes. No navegador, o Nginx do frontend encaminha `/stock-api` e `/billing-api` para os serviços correspondentes.

Endpoints de prontidão:

```text
GET http://localhost:8081/health/ready
GET http://localhost:8082/health/ready
```

## Frontend

O frontend usa Angular 22, Angular Material, componentes standalone, TypeScript estrito, Signals, RxJS e formulários reativos. A versão final entrega:

- shell ERP com navegação persistente no computador e trilho compacto no tablet;
- resumo de saldos disponíveis, reservados e produtos inativos;
- tabela operacional densa no computador e tablet, com cartões somente em telas estreitas;
- configuração de exibição nas duas listagens, com checkbox para cada atributo e preferência de colunas salva no `localStorage` do navegador;
- painéis de filtros completos para textos, identificadores, estados, saldos, quantidades e períodos, com aplicação imediata e parâmetros preservados na URL;
- atalhos para novo produto (`Alt+N`), atualizar (`Alt+R`) e localizar (`/`);
- cadastro, reposição, inativação e reativação de produtos;
- listagem e criação rápida de notas fiscais, com busca por número e filtros de situação Aberta, Fechada e Cancelada;
- preservação da busca e do filtro ao abrir uma nota e retornar à lista;
- inclusão, ajuste e remoção de itens com reserva de estoque e disponibilidade visível;
- cancelamento com devolução das reservas e fechamento da nota com consumo do estoque;
- visualização A4 dos itens da nota, pronta para impressão ou salvamento em PDF pelo navegador, com reimpressão de notas fechadas;
- atalhos de notas para criar (`Alt+N`), adicionar item (`Alt+I`) e imprimir (`Alt+P`);
- chaves idempotentes por ação lógica e tratamento de Problem Details;
- estados de carregamento, vazio, erro e sucesso.

## Impressão

O fechamento confirma o consumo das reservas antes de alterar a nota para `Closed`. Depois disso, o frontend disponibiliza uma visualização A4 e aciona a impressão nativa do navegador, que permite imprimir ou salvar o documento como PDF.

Notas fechadas e não canceladas podem ser reabertas na rota de impressão a qualquer momento. O documento é reconstruído com os dados persistidos; o backend não gera nem armazena um arquivo PDF ou XML fiscal.

Para desenvolvimento local, use Node.js compatível com o campo `engines` de `frontend/package.json`:

```bash
cd frontend
corepack enable
pnpm install --frozen-lockfile
pnpm start
```

O servidor de desenvolvimento usa `proxy.conf.json` para alcançar as APIs locais nas portas 8081 e 8082.

Build e testes do frontend:

```bash
cd frontend
pnpm build
pnpm exec ng test --watch=false
```

## Testes do backend

Com o Docker ativo e o SDK .NET 10 instalado:

```bash
cd backend
dotnet test Korp.slnx --configuration Release
```

A suíte inicia dois PostgreSQL descartáveis com Testcontainers, aplica as
migrations reais e testa as APIs de Estoque e Faturamento em conjunto. Os
volumes usados por `docker compose` não são alterados pelos testes.

## API de produtos

As operações que alteram estado exigem o cabeçalho `Idempotency-Key` com um UUID.
O cadastro separa o nome curto do produto de sua descrição detalhada; ambos são obrigatórios.

```text
GET  /api/products?includeInactive=false
GET  /api/products/{id}
POST /api/products
POST /api/products/{id}/replenishments
PUT  /api/products/{id}/activation
```

Para desativar ou reativar um produto, envie respectivamente
`{"isActive":false}` ou `{"isActive":true}` para a rota de ativação.

## API de reservas

As operações que alteram reservas também exigem um `Idempotency-Key` UUID.

```text
GET  /api/reservations/{invoiceId}
PUT  /api/reservations/{invoiceId}/products/{productId}
POST /api/reservations/{invoiceId}/release
POST /api/reservations/{invoiceId}/consume
```

O `PUT` recebe `{"quantity":N}` e define a quantidade total reservada para o
produto. Quantidade zero libera o item. A atualização do saldo é condicional e
atômica, impedindo que requisições concorrentes produzam saldo negativo.

## API de notas fiscais

Todas as operações de escrita exigem um `Idempotency-Key` UUID. O Faturamento
coordena reservas e consumo exclusivamente pela API HTTP do Estoque.

```text
GET  /api/invoices
GET  /api/invoices/{id}
POST /api/invoices
PUT  /api/invoices/{id}/products/{productId}
POST /api/invoices/{id}/cancel
POST /api/invoices/{id}/print
```

O `PUT` recebe `{"quantity":N}`; zero remove o item e libera sua reserva. O
cancelamento mantém o estado público `Open`, registra `isCancelled: true` e
impede novas alterações. A impressão consome as reservas antes de fechar a nota
e repete somente falhas transitórias do Estoque, em até três tentativas.

No frontend, a criação abre diretamente o detalhe da nova nota. Ao executar
`Fechar e imprimir`, o sistema confirma o consumo das reservas, fecha a nota e
abre o documento A4. Use `Imprimir ou salvar PDF` (ou `Alt+P`) para abrir a
impressão do navegador. Notas fechadas permitem abrir o documento novamente;
notas canceladas permanecem somente para consulta e não podem ser impressas.

Exemplo de cadastro:

```bash
curl -X POST http://localhost:8081/api/products \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 11111111-1111-4111-8111-111111111111' \
  -d '{"code":"PROD-001","name":"Caneta azul","description":"Caneta esferográfica de ponta fina","initialQuantity":10}'
```

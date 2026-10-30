# Painel First Mile — versão demo

Painel web para acompanhar a operação de **First Mile** (coleta de pacotes nos
vendedores) de um centro de distribuição: atribuição de veículos, pedidos às
transportadoras, coletas em tempo real, ocorrências por ponto, curva de chegada
no CD e os reports diários que o time manda nos grupos.

> **Todos os dados desta versão são fictícios.** Hub, clusters, transportadoras,
> sellers, motoristas, placas e pessoas são inventados e gerados por código. O
> projeto original foi feito para uso interno; esta é uma cópia de portfólio
> com a fonte de dados trocada por um simulador.

## O que tem no painel

| Tela | Para que serve |
| --- | --- |
| **Forms final de rota** | Cruza as rotas do dia com as respostas do formulário que o motorista preenche ao terminar: pendências por transportadora e cluster, adesão ao longo do tempo, rotas que não saíram (NS). |
| **Atribuição** | Quantas rotas de hoje, amanhã e depois ainda estão sem veículo, por transportadora, hub e cluster; veículo menor que o pedido. |
| **Scheduling** | Pedidos de veículo às transportadoras: aceites, recusas (inclusive as feitas depois das 11h da véspera), sem resposta e cancelados. |
| **Pool** | Carros que cada transportadora declara ter, contra os pedidos e contra a atribuição, com sinergia entre clusters e culpabilidade. |
| **Avulsas** | Rotas extras criadas no dia para voltar em ponto que ficou com pacote: motivos, clusters, pacotes por avulsa. |
| **Capacidade** | Risco de estouro (peso ou volume) de cada rota, comparando a carga prevista das paradas com o veículo que entrou. |
| **Curva de chegada** | Chegadas no CD hora a hora contra o ETA planejado, com motivo de atraso ou adiantamento. |
| **Monitoramento D0** | O coração do painel: cada ponto que ficou com pacote, a culpa prévia (transportadora, seller ou agência), se outra rota ainda vai passar, o que já foi revertido e as tratativas do time. |
| **Dedicada** | Rotas exclusivas de pontos grandes: coleta do dia, PU e histórico de 30 dias. |
| **Upgrade** | Vendedores que deixam muitos pacotes em agências e são candidatos a ter coleta própria. |
| **Reports** | Start do dia, fechamento, prévia do dia seguinte, GAP de rotas, H&B (pacotes grandes) e MeliOne, prontos para copiar e colar. |

## Como funciona

Na versão real, tudo vem de planilhas do Google Sheets, alimentadas por rotinas
que copiam os dados dos sistemas de logística e do BigQuery. O painel lê as
abas pela API do Sheets, por **cabeçalho** (nunca por posição de coluna), e grava
nelas o que o time registra na tela (tratativas, comentários, ajustes).

Nesta demo, `getSheetsClient()` devolve uma **planilha falsa em memória**
(`app/lib/demo/planilhaFalsa.ts`) que imita a parte da API usada pelo painel.
Cada aba é montada por um gerador (`app/lib/demo/abas*.ts`) a partir de um
"mundo" fictício (`app/lib/demo/mundo.ts`):

- os mesmos dados para a mesma data (semente pela data), então os históricos
  batem entre as telas;
- o dia de hoje **anda com o relógio**: só aparecem como visitadas as paradas
  cujo horário já passou (antes das 11h30, a demo mostra o dia como estaria às
  11h30);
- o que se grava na tela fica na memória do servidor até ele reiniciar.

O resto do código é o mesmo do painel original: as regras de negócio não
sabem que a planilha é falsa.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Server Components) + React 19 + TypeScript
- Tailwind CSS 4
- Testes com o runner nativo do Node (`node --test`), ~420 casos das regras de negócio

## Rodando

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # testes das regras
npm run build    # build de produção
```

Não precisa de variável de ambiente nem de credencial.

## Estrutura

```
app/
  <tela>/page.tsx        páginas (Server Components)
  api/                   rotas usadas pelas telas para ler e gravar
  components/            componentes de cada tela
  lib/                   regras de negócio (funções puras) e leitura das abas (*Dados.ts)
  lib/demo/              simulador: planilha falsa e geradores de dados
testes/                  testes das regras de negócio
```

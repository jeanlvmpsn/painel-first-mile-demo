# Painel First Mile (demo)

Painel e automações para acompanhar, em tempo quase real, uma operação de coletas de **primeira milha** (first mile): o que está previsto, preparado e coletado; quais rotas estão sem transportadora ou motorista; quem aceitou ou recusou os pedidos de veículo; e quais transportadoras estão aderindo ao formulário de final de rota.

> **Dados 100% fictícios.** Este repositório é uma versão de demonstração para portfólio. Nenhuma informação real de empresa, cliente, transportadora ou motorista foi usada. Nomes, IDs, placas e volumes são gerados por script.

*English summary: ops dashboard and automation suite for first-mile logistics (pickup monitoring, route assignment, carrier scheduling, end-of-route form compliance), built with Google Sheets, scheduled ETL workflows, BigQuery and Next.js. Demo version with synthetic data.*

## O problema

A operação precisava de uma visão única, atualizada a cada poucos minutos, de várias fontes que não conversavam entre si: APIs de monitoramento, planilhas de atribuição de rotas, pedidos de veículo (scheduling), respostas de formulário e tabelas no BigQuery. Antes, isso era consolidado manualmente ou por scripts soltos.

## O que o projeto faz

- **Monitoramento de coletas:** estimado × preparado × coletado por seller e por hora (HxH), com backlog e early.
- **Atribuição de rotas:** rotas do dia e dos próximos dias, com status de transportadora, veículo e motorista, e destaque para rotas sem TP.
- **Scheduling:** pedidos de veículo por transportadora (aceite, recusa, recusa pós-11h, sem resposta, cancelado), com histórico.
- **Formulário de final de rota:** cobrança de aderência por transportadora, cruzando com a chegada dos veículos.
- **Saúde da automação:** cada fluxo grava um carimbo de sucesso ou erro (por exemplo, "sessão vencida"), exibido no cabeçalho do painel.

## Arquitetura

```
Fontes (APIs, BigQuery, formulários)
        │
        ▼
Fluxos agendados de ETL  ──►  Google Sheets (camada de dados)
 (a cada 2–10 min)                    │
                                      ▼
                          Painel Next.js + Tailwind
```

Cada fluxo é independente, tem retry, ramo de erro e um carimbo de status. A camada de dados é uma planilha, o que deixa a operação livre para inspecionar e corrigir sem depender de um deploy.

## Destaques técnicos

- **Migração de 22 scripts Apps Script** para fluxos agendados, antes do desligamento da plataforma de origem.
- **Limites tratados:** payload por execução, rate limit (429), paginação por cursor, retry com espera e travas para duas rodadas não se sobreporem.
- **Gravação sem janela de dado vazio:** o fluxo grava em abas alternadas (A/B) e um ponteiro indica a aba ativa; a aba que o painel lê é uma fórmula sobre a ativa. Assim o painel nunca lê uma aba pela metade.
- **Dados grandes em partes:** bases acima do limite de uma execução são divididas em trechos e unidas por fórmula.
- **Regras de negócio explícitas:** por exemplo, hubs extras só aparecem em sábado, domingo e feriados (nacionais e locais, incluindo cálculo de Páscoa).
- **Resiliência de sessão:** quando o cookie de uma API vence, o erro é identificado e exibido de forma legível, em vez de falhar em silêncio.

## Stack

Google Sheets · Apps Script (versão original) · fluxos agendados de ETL (versão migrada) · BigQuery / SQL · JavaScript / Python · Next.js · Tailwind CSS

## Dados de demonstração

Os dados são sintéticos: transportadoras, clusters, rotas, placas e volumes inventados, com padrões plausíveis (picos por hora, recusas, rotas sem motorista) para que o painel tenha o que mostrar. Veja a pasta de dados e o gerador quando forem adicionados.

## Estrutura do repositório

> Em montagem. Este README descreve o projeto; os arquivos da demo (gerador de dados, painel e exemplos de fluxo) serão adicionados.

## Autor

Jean ([@jeanlvmpsn](https://github.com/jeanlvmpsn)). Dados e automação aplicados à logística.

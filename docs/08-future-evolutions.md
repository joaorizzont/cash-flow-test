# Evoluções futuras

O desafio aceita bem uma descrição do que seria implementado em seguida. Este documento lista as evoluções por tema e prioridade, além das limitações conhecidas da implementação atual.

Prioridade:

- **Agora**: necessário antes de uma entrada real em produção.
- **Próximo**: valioso nos primeiros meses de operação.
- **Depois**: depende da escala ou da direção do produto.

## Limitações conhecidas da implementação atual

| Limitação                                                   | Por que é aceitável hoje                                       | Evolução                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Rate limiting em memória, por réplica                       | Uma réplica por processo no ambiente local                     | Armazenamento compartilhado (Redis) ou limites no API Gateway                              |
| Fluxo de senha (ROPC) habilitado no client                  | Necessário para os scripts locais e os testes de carga         | Desabilitar em produção; apenas Authorization Code com PKCE                                |
| 100% dos traces amostrados                                  | O volume local é pequeno                                       | Amostragem por proporção ou tail sampling no Collector, mantendo sempre os traces com erro |
| Linhas publicadas do outbox nunca são apagadas              | Volume pequeno; também é útil para reprocessar eventos         | Job de limpeza com janela de retenção                                                      |
| Chaves de idempotência nunca expiram                        | Volume pequeno                                                 | Expiração após 24–72 h                                                                     |
| Moeda única (BRL)                                           | O desafio descreve um comerciante no Brasil                    | Múltiplas moedas, veja Dados                                                               |
| Atraso da consolidação limitado pelo intervalo de polling   | p95 de 0,5 s, muito abaixo do que um relatório diário precisa  | Despertar o relay com `LISTEN/NOTIFY` ou usar CDC                                          |
| Estado do circuit breaker por processo                      | Cada réplica se protege sozinha                                | Aceitável; estado compartilhado raramente compensa                                         |
| Alertas com limites fixos, sem Alertmanager                 | Visíveis no Prometheus no ambiente local                       | Alertas por burn rate encaminhados pelo Alertmanager                                       |
| Entradas obsoletas do cache podem ser servidas por até 24 h | Só durante uma queda do banco, sinalizada por `x-cache: STALE` | Ajustar conforme a necessidade dos comerciantes                                            |

## Plataforma

| Prioridade | Evolução                                                                                                                     | Justificativa                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agora      | Infraestrutura como código (Terraform) para a nuvem alvo (ECS/EKS, RDS, Amazon MQ ou SQS, ElastiCache)                       | Ambientes reproduzíveis e mudanças de infraestrutura revisáveis                                                                                                                         |
| Agora      | Adapters de SNS + SQS para o alvo de mensageria em produção (publisher e consumidor), com testes de integração no LocalStack | Mensageria em produção por uma fração do custo de um cluster de broker; os ports e o handler de mensagens são reaproveitados como estão ([arquitetura alvo](03-target-architecture.md)) |
| Agora      | Pipeline de CI/CD com lint, testes, cobertura, varredura de imagens e deploys automatizados                                  | Toda mudança passa pelos mesmos critérios de qualidade                                                                                                                                  |
| Próximo    | Kubernetes com Helm charts e GitOps (Argo CD), se a organização usar Kubernetes                                              | Deploys declarativos, rollbacks e detecção de divergência de configuração                                                                                                               |
| Próximo    | Deploys canary ou blue/green com rollback automático quando o SLO começar a queimar                                          | Limita o raio de impacto de uma release ruim                                                                                                                                            |
| Depois     | Multirregião ativo/passivo                                                                                                   | Somente se o negócio precisar de tolerância a desastres regionais além do Multi-AZ                                                                                                      |

## Mensageria

| Prioridade | Evolução                                                                          | Justificativa                                                                                                               |
| ---------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Agora      | Job de limpeza do outbox                                                          | Mantém a tabela pequena; a janela de retenção precisa cobrir as necessidades de reprocessamento da recuperação de desastres |
| Próximo    | `LISTEN/NOTIFY` para despertar o relay, mantendo o polling como rede de segurança | Latência de publicação próxima de zero com pouco custo operacional                                                          |
| Próximo    | Schema registry (Apicurio ou Confluent) quando mais times consumirem eventos      | Governança de contratos e verificação de compatibilidade fora de um único repositório                                       |
| Depois     | CDC com Debezium lendo o WAL em vez de polling                                    | Latência de milissegundos e sem polling; compensa com volume muito maior                                                    |
| Depois     | Particionamento por comerciante, se algum dia for necessário processar em ordem   | Hoje a ordem não importa, porque as atualizações do saldo são comutativas                                                   |

## Dados

| Prioridade | Evolução                                                                                                                                                                                             | Justificativa                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Próximo    | Importação histórica: um endpoint em lote (com escopo e trilha de auditoria próprios) que aceite lançamentos mais antigos que a janela de retroatividade, com chaves de idempotência determinísticas | Necessária para migrar o histórico de um sistema legado ([arquitetura de transição](04-transition-architecture.md)); a API comum rejeita, corretamente, datas de competência antigas |
| Próximo    | Fechamento de dias e meses (bloqueio de períodos passados)                                                                                                                                           | A contabilidade exige períodos fechados e imutáveis; hoje é possível lançar com até 30 dias de retroatividade                                                                        |
| Próximo    | Réplicas de leitura para o banco do consolidado                                                                                                                                                      | Descarregar relatórios de período pesados                                                                                                                                            |
| Depois     | Particionamento mensal de `entries` e `applied_movements`                                                                                                                                            | Mantém os índices pequenos e permite arquivamento barato                                                                                                                             |
| Depois     | Arquivamento de períodos fechados em object storage                                                                                                                                                  | Menor custo de armazenamento, retenção para conformidade                                                                                                                             |
| Depois     | Múltiplas moedas com regras explícitas de conversão                                                                                                                                                  | Comerciantes que operam no exterior; saldos por moeda                                                                                                                                |

## Funcionalidades do produto

| Prioridade | Evolução                                                                                 | Justificativa                                                                |
| ---------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Próximo    | Categorias e centros de custo para os lançamentos, com relatórios por categoria          | Transforma o fluxo de caixa em uma ferramenta de gestão                      |
| Próximo    | Exportação de relatórios (CSV, PDF) e envio agendado por e-mail do fechamento diário     | Pedido comum dos comerciantes                                                |
| Próximo    | Vários usuários por comerciante com permissões granulares                                | O modelo de papéis já suporta operador e analista; estender para mais perfis |
| Depois     | Integrações com POS e adquirentes via webhooks                                           | Lançamentos registrados automaticamente a partir de vendas e liquidações     |
| Depois     | Conciliação bancária (importação de OFX/CNAB) cruzando linhas do extrato com lançamentos | Detecta lançamentos ausentes ou duplicados                                   |
| Depois     | Previsão de fluxo de caixa com base no histórico e nos recebíveis                        | Ajuda os comerciantes a planejar                                             |
| Depois     | Notificações (saldo baixo ou negativo, movimentações incomuns)                           | Valor proativo a partir dos mesmos eventos                                   |

## Qualidade

| Prioridade | Evolução                                                                                  | Justificativa                                                                                |
| ---------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Agora      | Testes de contrato (Pact) para eventos e APIs                                             | Detecta mudanças incompatíveis entre produtor e consumidores antes do deploy                 |
| Próximo    | Testes baseados em propriedades para dinheiro, composição do saldo e datas de competência | Explora casos de borda (fusos, overflow, muitos movimentos) além dos exemplos escritos à mão |
| Próximo    | Testes de carga e resiliência no pipeline contra um ambiente de staging                   | Requisitos verificados a cada release, não só localmente                                     |
| Depois     | Testes de mutação                                                                         | Mede a força da suíte de testes                                                              |
| Depois     | Experimentos de caos (latência de rede, partições do broker)                              | Valida o comportamento além de quedas limpas de parar e subir                                |

## Segurança

| Prioridade | Evolução                                                                       | Justificativa                                                |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Agora      | Segredos em um gerenciador (AWS Secrets Manager, Vault) com rotação            | Nenhuma credencial em arquivos de configuração               |
| Agora      | TLS em todo lugar; mTLS entre serviços por meio de um service mesh, se adotado | Criptografia em trânsito dentro da rede                      |
| Próximo    | OAuth client credentials para integrações de sistemas (POS, adquirentes)       | Identidades de máquina separadas das identidades de usuários |
| Próximo    | Regras de WAF e proteção contra bots na borda                                  | Protege as APIs antes que o tráfego chegue aos serviços      |
| Próximo    | Exportação do log de auditoria para um SIEM                                    | Quem registrou ou estornou o quê, retido e pesquisável       |

## Observabilidade

| Prioridade | Evolução                                                         | Justificativa                                                                   |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Agora      | Alertmanager com roteamento por severidade e links para runbooks | Os alertas chegam às pessoas; os runbooks estão em [operação](07-operations.md) |
| Próximo    | Alertas de SLO por burn rate                                     | Alertar pela velocidade de consumo do error budget, não por limites fixos       |
| Próximo    | Exemplars ligando picos de métricas a traces                     | Ir de um pico de latência direto a um trace lento                               |
| Depois     | Dashboards de custo por serviço                                  | Manter o custo de infraestrutura visível ao lado do uso                         |
| Depois     | Real user monitoring quando houver um frontend                   | Mede a experiência do comerciante, não só a da API                              |

## Experiência de desenvolvimento

| Prioridade | Evolução                                                      | Justificativa                                         |
| ---------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| Próximo    | Aplicação web para os comerciantes (lançamentos e relatórios) | As APIs estão prontas; um frontend completa o produto |
| Próximo    | SDKs de cliente gerados a partir dos documentos OpenAPI       | Integradores consomem clientes tipados                |
| Depois     | Desenvolvimento local com hot reload dentro dos containers    | Hoje os serviços rodam com `tsx watch` fora do Docker |

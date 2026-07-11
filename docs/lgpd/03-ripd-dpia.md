# B3 — RIPD: Relatório de Impacto à Proteção de Dados Pessoais

**Base legal:** art. 5º, XVII, e art. 38 da LGPD. Recomendado pela ANPD para tratamentos de
**alto risco**. Este sistema se enquadra por tratar **dados sensíveis de pessoas vulneráveis**
(vítimas de violência sexual e doméstica, crianças e adolescentes) em contexto de segurança pública.

**Controlador:** GCM de Bananeiras — PB · **Encarregado:** ver [B1](01-encarregado-dpo.md) · **Data:** [data]

## 1. Descrição do tratamento

Registro de Boletins de Ocorrência e gestão operacional da GCM, com coleta de identificação,
localização, relato e, quando aplicável, dados sensíveis. Ver [ROPA](02-ropa-registro-operacoes.md).

## 2. Necessidade e proporcionalidade

- **Finalidade legítima e específica:** exercício das atribuições da GCM (Lei 13.022/2014).
- **Minimização:** coletar apenas o necessário ao registro; campos livres orientados a evitar
  excesso de PII. A censura automática restringe dados sensíveis ao comando.
- **Base legal adequada:** art. 23 + art. 7º/11/14 conforme o dado.

## 3. Riscos identificados e medidas mitigadoras

| # | Risco | Probab. | Impacto | Medida mitigadora | Status |
|---|-------|---------|---------|-------------------|--------|
| 1 | Acesso indevido a BO sensível por agente comum | Média | Alto | Censura automática + RBAC + auditoria | ✅ Implementado |
| 2 | Vazamento do banco (dados em repouso) | Baixa | Alto | Criptografia AES-256-GCM de BO e PII de agentes | ✅ Implementado |
| 3 | Interceptação em trânsito | Baixa | Alto | HTTPS/TLS + HSTS | ✅ Implementado |
| 4 | Envio de PDF sensível por e-mail a destino incorreto | Média | Alto | BO sensível censurado no e-mail + caixa **institucional** + auditoria de falha | ✅ Implementado |
| 5 | PII em logs de aplicação (stdout do provedor) | Média | Médio | Em produção loga só a mensagem, sem parâmetros | ✅ Implementado |
| 6 | Retenção excessiva | Média | Médio | Retenção de 5 anos + anonimização; expurgo de logs | ✅ Implementado |
| 7 | Transferência internacional sem salvaguarda | Média | Alto | Divulgação no aviso; DPA com operadores; avaliar região BR na migração | ⏳ Em tratamento (ver [C](07-checklist-migracao-hostgator.md)) |
| 8 | Perda da chave de criptografia (indisponibilidade) | Baixa | Alto | Canário de chave + custódia da `ENCRYPTION_KEY` fora do provedor | ⏳ Formalizar custódia |
| 9 | Ausência de backup (provedor free) | Média | Alto | Definir rotina de backup e teste de restauração | ⏳ Na migração |
| 10 | Exportação de logs sem rastreio | Baixa | Médio | Evento `EXPORTAR_LOGS` + IP mascarado a supervisor | ✅ Implementado |

## 4. Conclusão

O tratamento é **necessário e proporcional** à finalidade pública, e os riscos residuais
estão em nível aceitável após as medidas implementadas, restando os itens ⏳ a formalizar na
migração de infraestrutura. Reavaliar este RIPD a cada mudança relevante.

_Versão 1.0 — [data] · Responsável: [Encarregado]_

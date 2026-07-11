# Governança LGPD — GCM Bananeiras

Modelos e registros de conformidade com a **Lei nº 13.709/2018 (LGPD)** e as orientações
da **ANPD** para o Sistema de Registro de BO da Guarda Civil Municipal de Bananeiras — PB.

> ⚠️ **Como usar:** estes documentos são **modelos pré-preenchidos** com os fatos técnicos já
> conhecidos do sistema. Os campos entre colchetes `[...]` devem ser completados pelo órgão
> (nomes, datas, atos oficiais) e aprovados/publicados pela autoridade competente. Depois de
> preenchidos, devem ser **datados, versionados e assinados**.

## Papéis (art. 5º LGPD)

| Papel | Quem |
|-------|------|
| **Controlador** | Guarda Civil Municipal de Bananeiras / Prefeitura Municipal de Bananeiras — PB |
| **Encarregado (DPO)** | [nome a ser designado — ver `01-encarregado-dpo.md`] |
| **Operadores** | Provedor de nuvem (Render → HostGator), Brevo (e-mail), Google (caixa institucional) |

## Índice

| # | Documento | Base legal |
|---|-----------|-----------|
| B1 | [Indicação do Encarregado (DPO)](01-encarregado-dpo.md) | art. 41; art. 23 §1º |
| B2 | [ROPA — Registro das Operações de Tratamento](02-ropa-registro-operacoes.md) | art. 37 |
| B3 | [RIPD — Relatório de Impacto à Proteção de Dados](03-ripd-dpia.md) | art. 5º XVII; art. 38 |
| B4 | [Plano de Resposta a Incidentes](04-plano-resposta-incidentes.md) | art. 48 |
| B5 | [Operadores e Cláusulas de Tratamento (DPA)](05-operadores-dpa.md) | art. 39 |
| B6 | [Política de Privacidade, Segurança e Retenção](06-politica-privacidade-seguranca-retencao.md) | art. 6º; art. 46; art. 50 |
| C | [Checklist de Migração para HostGator](07-checklist-migracao-hostgator.md) | art. 33; art. 6º VII |

## Medidas técnicas já implementadas no sistema (resumo)

- Criptografia AES-256-GCM do conteúdo dos BOs e de campos pessoais de agentes (CPF, RG,
  endereço, telefone, data de nascimento) — `backend/utils/encryption.js`.
- Controle de acesso por papel (admin / supervisor / agente) e censura de BOs sensíveis
  para o agente — `backend/utils/boSensivel.js`.
- Trilha de auditoria de todas as ações, com retenção configurável e IP mascarado para
  supervisores — `backend/middleware/auth.js`, `backend/routes/authRoutes.js`.
- Política de senha forte, CSRF, rate limiting, sessão única e cabeçalhos de segurança
  (helmet: HSTS + CSP) — `backend/server.js`.
- Retenção configurável de BOs (5 anos) com opção de **anonimização**, e retenção/expurgo
  do log de auditoria.
- Aviso de privacidade exibido e registrado no primeiro acesso — `frontend/pages/aviso-lgpd.html`.

_Última atualização: [preencher] — versão 1.0_

# B6 — Política de Privacidade, Segurança da Informação e Retenção

**Base legal:** art. 6º (princípios), art. 46 (segurança), art. 50 (boas práticas e governança).
Documento interno da GCM de Bananeiras — PB.

## 1. Princípios (art. 6º)

Finalidade, adequação, necessidade (minimização), livre acesso, qualidade dos dados,
transparência, segurança, prevenção, não discriminação e **responsabilização e prestação
de contas** (accountability).

## 2. Base legal e natureza do "aceite" LGPD

O tratamento se apoia na **execução de política pública** (art. 23 c/c art. 7º II/III; art. 11
para sensíveis; art. 14 para crianças). O registro `lgpd_aceito` no sistema é **ciência do
Aviso de Privacidade** — **não** é consentimento como base legal (que aqui não se aplica ao
poder público no exercício de suas competências).

## 3. Controle de acesso

- Perfis: **admin** (gestão total), **supervisor** (operacional + auditoria com IP mascarado),
  **agente** (apenas os próprios BOs; sensíveis censurados).
- Sessão única por usuário (exceto admin); expiração por inatividade; senha forte.
- Concessão por **menor privilégio** e **necessidade de conhecer**.

## 4. Segurança da informação (art. 46)

- Criptografia AES-256-GCM em repouso (BO e PII de agentes) + HTTPS/TLS + HSTS.
- CSP, CSRF, rate limiting, cabeçalhos de segurança (helmet).
- Trilha de auditoria de acessos e alterações; logs de aplicação sem PII em produção.
- Custódia da `ENCRYPTION_KEY` **fora** do provedor de nuvem, com cópia segura sob controle
  do município (a perda da chave inutiliza os dados cifrados).
- Backup periódico com teste de restauração (a definir no provedor — ver [C](07-checklist-migracao-hostgator.md)).

## 5. Retenção e eliminação

| Dado | Prazo | Destino após o prazo |
|------|-------|----------------------|
| Boletins de Ocorrência | 5 anos (`RETENCAO_ANOS`) | Arquivamento, eliminação segura **ou anonimização** (preserva estatística sem PII) |
| Log de auditoria | 2 anos (`RETENCAO_LOGS_ANOS`) | Expurgo |
| Token de recuperação de senha | 1 hora | Invalidação automática |
| Dados de agentes | Vínculo funcional + prazos legais | Eliminação/arquivamento conforme legislação de pessoal |

Rotinas administrativas disponíveis: `POST /api/auth/retencao/anonimizar`,
`DELETE /api/auth/retencao/arquivar`, `DELETE /api/auth/auditoria/retencao/expurgar`.
Recomenda-se execução **periódica documentada** (ex.: anual).

## 6. Direitos dos titulares

Atendidos pelo Encarregado (ver [B1](01-encarregado-dpo.md)): confirmação/acesso, correção,
anonimização/bloqueio/eliminação, portabilidade, informação sobre compartilhamento e revisão
de decisões automatizadas. Direito de peticionar à ANPD (art. 18, §1º).

## 7. Revisão

Revisar esta política anualmente ou a cada mudança relevante de tratamento, tecnologia ou
legislação. Registrar versão e data.

_Versão 1.0 — [data]_

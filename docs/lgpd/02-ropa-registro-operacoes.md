# B2 — ROPA: Registro das Operações de Tratamento de Dados Pessoais

**Base legal:** art. 37 da LGPD. Modelo alinhado ao *Guia Orientativo da ANPD para o Poder Público*
e ao *Framework de Privacidade e Segurança da Informação*.

**Controlador:** Guarda Civil Municipal de Bananeiras — PB · **Encarregado:** ver [B1](01-encarregado-dpo.md)
· **Última revisão:** [data]

---

## Operação 1 — Registro de Boletins de Ocorrência (BO)

| Item | Descrição |
|------|-----------|
| **Finalidade** | Registro e instrução de ocorrências no exercício das atribuições da GCM (Lei 13.022/2014). |
| **Base legal** | art. 23 c/c art. 7º, II e III. Dados sensíveis: art. 11, II, "a"/"b". Crianças/adolescentes: art. 14. |
| **Categorias de titulares** | Solicitantes, vítimas (incl. de violência sexual/doméstica), suspeitos, testemunhas, crianças e adolescentes. |
| **Categorias de dados** | Nome, CPF, RG, filiação, endereço, telefone, data de nascimento; natureza/tipificação, local, relato; **dados sensíveis** (crimes sexuais, violência doméstica, saúde). |
| **Anexos** | Imagens e documentos (JPG/PNG/PDF/DOC) — podem conter PII/imagem de pessoas. |
| **Compartilhamento** | Órgãos de segurança pública, Judiciário, Ministério Público, mediante obrigação/ordem legal (art. 7º VI). |
| **Operadores** | Provedor de nuvem (banco de dados); Brevo (envio do PDF por e-mail à caixa institucional). |
| **Transferência internacional** | Possível, conforme localização dos servidores do operador (art. 33). Ver [C](07-checklist-migracao-hostgator.md). |
| **Retenção** | 5 anos (`RETENCAO_ANOS`); depois: arquivamento, eliminação segura ou **anonimização**. |
| **Segurança** | Criptografia AES-256-GCM em repouso; HTTPS; RBAC; censura de sensíveis para agente; auditoria. |

## Operação 2 — Cadastro e gestão de agentes (RH operacional)

| Item | Descrição |
|------|-----------|
| **Finalidade** | Gestão funcional: escala, plantões extras, férias, contato e identificação. |
| **Base legal** | art. 23 (política de pessoal) c/c art. 7º, II; execução de contrato/vínculo funcional. |
| **Categorias de titulares** | Guardas civis municipais e usuários do sistema. |
| **Categorias de dados** | Nome, matrícula, CPF, RG, data de nascimento, endereço, telefone, e-mail, lotação, turno, foto. |
| **Operadores** | Provedor de nuvem. |
| **Retenção** | Enquanto durar o vínculo + prazos legais/trabalhistas aplicáveis. |
| **Segurança** | CPF, RG, endereço, telefone e data de nascimento **cifrados** em repouso; acesso restrito a admin/próprio titular. |

## Operação 3 — Autenticação e trilha de auditoria (logs)

| Item | Descrição |
|------|-----------|
| **Finalidade** | Segurança da informação, rastreabilidade e accountability (art. 37/48). |
| **Base legal** | art. 23 c/c art. 7º, II (obrigação/legítimo exercício de função pública). |
| **Categorias de titulares** | Usuários do sistema (agentes, supervisores, admin). |
| **Categorias de dados** | Usuário, ação, recurso, **IP**, data/hora, dispositivo/navegador/SO, ID de sessão. |
| **Operadores** | Provedor de nuvem. Logs de aplicação (stdout) no provedor — sem PII em produção. |
| **Retenção** | `RETENCAO_LOGS_ANOS` (padrão 2 anos), com expurgo. IP mascarado para supervisores. |

## Operação 4 — Recuperação de senha e notificações por e-mail

| Item | Descrição |
|------|-----------|
| **Finalidade** | Redefinição de senha e envio automático de PDFs à caixa institucional de comando. |
| **Base legal** | art. 23 c/c art. 7º, II. |
| **Categorias de dados** | E-mail, nome/usuário; anexos em PDF (BO sensível vai **censurado**). |
| **Operadores** | Brevo (transporte de e-mail); Google/caixa institucional (destinatário). |
| **Transferência internacional** | Provável (servidores do provedor de e-mail). Ver [B5](05-operadores-dpa.md). |
| **Retenção** | Token de reset expira em 1 hora; e-mails conforme política da caixa institucional. |

---

_Revisar a cada mudança relevante de operação, operador ou finalidade. Versão 1.0 — [data]._

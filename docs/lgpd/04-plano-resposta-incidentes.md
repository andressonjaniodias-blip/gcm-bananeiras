# B4 — Plano de Resposta a Incidentes de Segurança com Dados Pessoais

**Base legal:** art. 46, 48 e 50 da LGPD. Alinhado ao NIST CSF (Detectar / Responder / Recuperar)
e ao *Guia de Segurança da Informação para Agentes de Tratamento de Pequeno Porte* (ANPD).

## 1. Definição

Considera-se **incidente de segurança** qualquer evento que comprometa a confidencialidade,
integridade ou disponibilidade de dados pessoais: acesso não autorizado, vazamento, perda,
alteração indevida, indisponibilidade relevante ou destruição.

## 2. Papéis

| Papel | Responsável |
|-------|-------------|
| Coordenação da resposta | Encarregado (DPO) — ver [B1](01-encarregado-dpo.md) |
| Apoio técnico | Responsável pelo sistema / TI |
| Autoridade decisória | Comando da GCM |

## 3. Fluxo de resposta

1. **Detecção e registro** — identificar (via auditoria, alertas do provedor, denúncia).
   Registrar data/hora, origem e sistema afetado. Preservar evidências (não apagar logs).
2. **Contenção** — encerrar sessões comprometidas, revogar acessos, trocar segredos
   (`JWT_SECRET`, `BREVO_API_KEY`, senhas), isolar o recurso afetado. **Não** trocar a
   `ENCRYPTION_KEY` sem custódia da chave original (risco de tornar dados ilegíveis).
3. **Avaliação de risco** — natureza dos dados (sensíveis?), volume, titulares afetados
   (vítimas, crianças?), probabilidade de dano.
4. **Comunicação (art. 48)** — se houver risco/dano relevante aos titulares, comunicar à
   **ANPD** e aos **titulares afetados** em **prazo razoável** (prazo de referência da ANPD),
   informando: descrição dos dados, titulares envolvidos, medidas técnicas, riscos e medidas
   de mitigação. Modelo de comunicação no anexo abaixo.
5. **Erradicação e recuperação** — corrigir a causa raiz, restaurar de backup íntegro,
   validar integridade (canário de criptografia).
6. **Lições aprendidas** — registrar no relatório de incidente e atualizar controles/RIPD.

## 4. Registro de incidentes

| Data | Descrição | Dados/titulares afetados | Sensível? | ANPD notificada | Titulares notificados | Causa raiz | Medidas |
|------|-----------|--------------------------|-----------|-----------------|-----------------------|-----------|---------|
| | | | | | | | |

## 5. Anexo — modelo de comunicação de incidente

> **Assunto:** Comunicação de incidente de segurança com dados pessoais — GCM Bananeiras
>
> Informamos que em [data] identificamos [descrição]. Foram potencialmente afetados
> [categorias de dados/titulares]. Adotamos as seguintes medidas: [contenção/mitigação].
> Recomendamos aos titulares: [orientações]. Contato do Encarregado: encarregado@bananeiras.pb.gov.br.

## 6. Contatos

- Encarregado (DPO): encarregado@bananeiras.pb.gov.br — [telefone]
- ANPD: canal oficial de comunicação de incidentes (gov.br/anpd).
- Provedores (suporte/segurança): ver [B5](05-operadores-dpa.md).

_Versão 1.0 — [data]_

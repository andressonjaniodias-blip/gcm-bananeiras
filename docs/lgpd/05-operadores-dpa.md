# B5 — Operadores e Cláusulas de Tratamento de Dados (DPA)

**Base legal:** art. 39 (operador trata conforme instruções do controlador) e art. 33
(transferência internacional). Para cada operador deve existir contrato/termo prevendo
proteção de dados (DPA — *Data Processing Agreement*).

## 1. Inventário de operadores

| Operador | Serviço | Dados tratados | Localização provável | Transf. internacional | DPA/termo |
|----------|---------|----------------|----------------------|-----------------------|-----------|
| Provedor de nuvem (Render → **HostGator**) | Hospedagem + banco de dados | Todos (BO, agentes, logs) | [EUA / a definir na migração] | Sim (verificar) | [pendente] |
| Brevo (Sendinblue) | Envio de e-mails (reset de senha, PDFs) | E-mail, nome, anexos PDF | UE | Sim | [pendente] |
| Google (caixa institucional) | Recebimento dos PDFs de notificação | E-mail + anexos | EUA | Sim | [pendente — usar Google Workspace com termos] |

> Atualizar esta tabela a cada inclusão/troca de operador.

## 2. Cláusulas mínimas a exigir de cada operador (art. 39)

1. Tratar os dados **exclusivamente conforme instruções** documentadas do controlador.
2. Adotar **medidas de segurança** técnicas e administrativas adequadas (art. 46).
3. **Confidencialidade** dos dados e do pessoal com acesso.
4. **Sigilo** e restrição de subcontratação (suboperadores) sem autorização.
5. **Auxílio** ao controlador no atendimento a titulares e à ANPD.
6. **Notificação de incidentes** ao controlador em prazo célere.
7. **Eliminação/devolução** dos dados ao fim do contrato.
8. Em transferência internacional: **salvaguardas do art. 33** (cláusulas-padrão, garantias
   adequadas) e, quando possível, **região de dados no Brasil**.

## 3. Ações pendentes

- [ ] Firmar/registrar DPA com o provedor de nuvem (priorizar na migração para HostGator).
- [ ] Registrar termos de tratamento da Brevo e verificar região.
- [ ] Formalizar a caixa institucional (evitar e-mail pessoal) e termos do provedor de e-mail.
- [ ] Avaliar região **Brasil** para reduzir transferência internacional.

_Versão 1.0 — [data]_

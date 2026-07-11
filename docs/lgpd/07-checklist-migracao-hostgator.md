# C — Checklist de Migração para HostGator (portabilidade e lock-in)

**Base legal / referência:** art. 33 (transferência internacional) e art. 6º, VII (segurança/
disponibilidade) da LGPD; *Boas Práticas para Minimizar o Aprisionamento (lock-in) em Nuvem* (SGD);
NIST CSF — Recuperar.

> A migração de infraestrutura é o momento crítico para **portabilidade, residência de dados,
> backup e custódia de chaves**. Executar na ordem abaixo, validando cada etapa.

## 1. 🔑 Preservar a chave de criptografia (CRÍTICO)

- [ ] Hoje o `render.yaml` usa `ENCRYPTION_KEY: generateValue: true` — **o provedor gera e detém
      a chave**. Antes de migrar, **exportar o valor atual** da `ENCRYPTION_KEY` do ambiente do Render.
- [ ] Guardar a chave em **local seguro sob controle do município** (cofre de segredos / documento
      lacrado), fora do provedor de nuvem.
- [ ] Configurar **a mesma** `ENCRYPTION_KEY` no HostGator. ⚠️ Migrar com chave diferente torna
      **todos os BOs e o CPF/RG/endereço dos agentes permanentemente ilegíveis** — o canário de
      criptografia (`backend/config/db.js`) aborta o start para proteger contra isso.
- [ ] Preservar também `JWT_SECRET` (ou planejar reautenticação de todos os usuários).

## 2. 📦 Exportar e restaurar os dados (portabilidade)

- [ ] `pg_dump` do banco PostgreSQL atual (formato custom + SQL puro como redundância).
- [ ] Restaurar (`pg_restore`) no PostgreSQL do HostGator.
- [ ] Validar contagens (boletins, agentes, audit_logs) e abrir um BO antigo para confirmar
      que a **descriptografia funciona** com a chave migrada.
- [ ] Confirmar que as migrações de schema em `db.js` rodam sem erro no novo banco.

## 3. 🌎 Residência de dados e transferência internacional (art. 33)

- [ ] Verificar a **região** dos servidores no HostGator; preferir **Brasil**, se disponível,
      para reduzir/eliminar transferência internacional.
- [ ] Atualizar o [ROPA](02-ropa-registro-operacoes.md) e o [DPA de operadores](05-operadores-dpa.md)
      com a localização efetiva.
- [ ] Revisar o [Aviso de Privacidade](../../frontend/pages/aviso-lgpd.html) se a situação de
      transferência internacional mudar.

## 4. 💾 Backup e recuperação (disponibilidade)

- [ ] Configurar **backup automático** do banco (o plano free do Render não possui) com
      periodicidade definida e retenção.
- [ ] Documentar e **testar a restauração** (restore drill) ao menos uma vez.
- [ ] Registrar RTO/RPO aceitáveis para o serviço.

## 5. 🔧 Configuração do novo ambiente

- [ ] `NODE_ENV=production`, `CORS_ORIGIN` = domínio final, `APP_URL` = URL final.
- [ ] `NOTIFICACAO_PDF_EMAIL` = **caixa institucional** (não e-mail pessoal), `SMTP_FROM` institucional.
- [ ] `RETENCAO_ANOS`, `RETENCAO_LOGS_ANOS`, `BREVO_API_KEY` configurados.
- [ ] Forçar HTTPS no domínio (certificado válido) — HSTS já é enviado pelo helmet.
- [ ] Testes de fumaça: login, criação de BO (comum e sensível), export PDF, auditoria.

## 6. 🧹 Descomissionamento do ambiente antigo

- [ ] Confirmar migração íntegra antes de desligar o Render.
- [ ] **Eliminação segura** dos dados no provedor antigo (banco e backups), registrando a ação.
- [ ] Revogar segredos antigos que não forem reutilizados.

_Versão 1.0 — [data]_

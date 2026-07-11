// Regras de senha do sistema — fonte única no frontend. DEVE espelhar
// backend/utils/validation.js (validarSenha), que é aplicado em todas as rotas
// que definem senha (setup, usuários criar/editar, redefinir-senha, trocar-senha).

const SENHA_REGRAS_TEXTO =
  'A senha deve ter no mínimo 8 caracteres e incluir ao menos 1 letra maiúscula, 1 número e 1 caractere especial (!@#$%…).';

// Retorna a mensagem de erro da primeira regra violada, ou null se a senha é válida.
// Mensagens idênticas às do backend para uma experiência consistente.
function validarSenhaCliente(senha) {
  if (!senha || senha.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (!/[A-Z]/.test(senha))        return 'A senha deve conter pelo menos uma letra maiúscula.';
  if (!/[0-9]/.test(senha))        return 'A senha deve conter pelo menos um número.';
  if (!/[^A-Za-z0-9]/.test(senha)) return 'A senha deve conter pelo menos um caractere especial (!@#$%...).';
  return null;
}

// Preenche automaticamente qualquer elemento .senha-regras com o texto das regras,
// evitando duplicar o texto no HTML de cada página.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.senha-regras').forEach(el => { el.textContent = SENHA_REGRAS_TEXTO; });
});

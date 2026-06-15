/* Aplica o tema salvo imediatamente para evitar flash */
(function () {
  const tema = localStorage.getItem('gcm-tema') || 'gov-modern';
  document.documentElement.setAttribute('data-theme', tema);
})();

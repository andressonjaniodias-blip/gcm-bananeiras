// Aplica o tema salvo antes da pintura (evita o flash de tema errado).
// Padrão: claro. A alternância claro/escuro fica no botão sol/lua do cabeçalho
// (ver toggleTema em sidebar.js e no index.html).
(function () {
  var tema = 'light';
  try {
    if (localStorage.getItem('gcm-tema') === 'dark') tema = 'dark';
  } catch (e) { /* localStorage indisponível — mantém claro */ }
  document.documentElement.setAttribute('data-theme', tema);
})();

/* Gerenciador de temas — injetar antes do </body> em todas as páginas */
(function () {
  const THEMES = [
    { id: 'gov-modern',   label: 'Gov Modern',   icon: '🏛️' },
    { id: 'dark-command', label: 'Dark Command',  icon: '🌑' },
  ];

  const STORAGE_KEY = 'gcm-tema';

  function getTheme() {
    return localStorage.getItem(STORAGE_KEY) || 'gov-modern';
  }

  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem(STORAGE_KEY, id);
    // Atualiza estado visual do menu
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === id);
    });
  }

  function buildSwitcher() {
    const wrapper = document.createElement('div');
    wrapper.id = 'theme-switcher';

    const menu = document.createElement('div');
    menu.id = 'theme-menu';

    THEMES.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'theme-option';
      btn.dataset.theme = t.id;
      btn.innerHTML = `<span>${t.icon}</span> ${t.label}`;
      btn.addEventListener('click', () => {
        applyTheme(t.id);
        menu.classList.remove('open');
      });
      menu.appendChild(btn);
    });

    const trigger = document.createElement('button');
    trigger.id = 'theme-switcher-btn';
    trigger.innerHTML = '🎨 Tema';
    trigger.setAttribute('aria-label', 'Mudar tema');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    document.addEventListener('click', () => menu.classList.remove('open'));

    wrapper.appendChild(menu);
    wrapper.appendChild(trigger);
    document.body.appendChild(wrapper);

    // Marca o tema ativo no menu
    applyTheme(getTheme());
  }

  // Aplica o tema IMEDIATAMENTE para evitar flash
  document.documentElement.setAttribute('data-theme', getTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildSwitcher);
  } else {
    buildSwitcher();
  }
})();

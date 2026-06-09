// Injeta menu lateral em todas as páginas protegidas
(function () {
  const path = window.location.pathname;
  const skipPages = ['index.html', 'setup.html', 'aviso-lgpd.html'];
  if (path === '/' || skipPages.some(p => path.endsWith(p))) return;

  const MENU = [
    { href: '/pages/home.html',       label: '🏠 Início',              roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/dashboard.html',  label: '📝 Novo BO',             roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/consulta.html',   label: '🔍 Histórico de BOs',    roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/relatorio.html',  label: '📊 Relatório Interno',   roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/viatura.html',    label: '🚗 Controle de Viatura', roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/documentos.html', label: '📁 Documentos',          roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/perfil.html',     label: '👤 Meu Perfil',          roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/logs.html',       label: '📋 Log de Auditoria',    roles: ['supervisor', 'admin'] },
    { href: '/pages/usuarios.html',   label: '👥 Usuários',            roles: ['admin'] },
  ];

  function buildSidebar() {
    const perfil = JSON.parse(sessionStorage.getItem('perfil') || '{}');
    const ROLES_VALIDOS = ['admin', 'supervisor', 'agente'];
    const roleEfetivo = ROLES_VALIDOS.includes(perfil.role) ? perfil.role : 'agente';
    const allMenu = MENU.filter(item => item.roles.includes(roleEfetivo));

    const navHTML = allMenu.map(item => {
      const active = window.location.pathname.includes(item.href.replace('/pages/', '')) ? ' active' : '';
      return `<a href="${item.href}" class="sb-link${active}">${item.label}</a>`;
    }).join('');

    const roleLabel = { admin: 'Administrador', supervisor: 'Supervisor', agente: 'Agente GCM' }[roleEfetivo] || 'Agente GCM';
    const initial = (perfil.usuario || '?')[0].toUpperCase();

    const aside = document.createElement('aside');
    aside.id = 'sidebar';
    aside.innerHTML = `
      <div class="sb-user">
        <div class="sb-avatar" id="sbAvatar">${initial}</div>
        <div class="sb-user-info">
          <span class="sb-user-name" id="sbNome">${perfil.usuario || '—'}</span>
          <span class="sb-user-role" id="sbRole">${roleLabel}</span>
        </div>
        <button class="sb-close-btn" onclick="toggleSidebar()" title="Fechar menu">✕</button>
      </div>
      <nav class="sb-nav">${navHTML}</nav>
      <div class="sb-footer">
        <button class="sb-btn-sair" onclick="logout()">Sair do Sistema</button>
      </div>
    `;

    // Overlay para fechar ao clicar fora
    const overlay = document.createElement('div');
    overlay.id = 'sb-overlay';
    overlay.onclick = closeSidebar;

    // Botão flutuante para abrir o menu
    const fab = document.createElement('button');
    fab.id = 'sb-fab';
    fab.title = 'Menu';
    fab.innerHTML = '☰';
    fab.onclick = toggleSidebar;

    const wrapper = document.createElement('div');
    wrapper.id = 'app-content';
    Array.from(document.body.children).forEach(c => wrapper.appendChild(c));
    document.body.appendChild(aside);
    document.body.appendChild(overlay);
    document.body.appendChild(fab);
    document.body.appendChild(wrapper);
    document.body.classList.add('has-sidebar');

    // Ajusta --header-h com a altura real do cabeçalho
    function syncHeaderHeight() {
      const header = document.querySelector('.header');
      if (header) {
        const h = header.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--header-h', h + 'px');
      }
    }
    syncHeaderHeight();
    window.addEventListener('resize', syncHeaderHeight);

    // Remove elementos duplicados do cabeçalho que agora ficam no sidebar
    const headerActionDiv = document.querySelector('.header > div:not(.header-titulo)');
    if (headerActionDiv) headerActionDiv.remove();
    const legacyUserSpan = document.getElementById('usuarioLogado');
    if (legacyUserSpan) legacyUserSpan.closest('div')?.remove();
  }

  // Fallback de logout para páginas que não carregam main.js
  if (typeof window.logout !== 'function') {
    window.logout = async function () {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch {}
      sessionStorage.removeItem('perfil');
      localStorage.removeItem('authToken');
      window.location.href = '/';
    };
  }

  window.toggleSidebar = function () {
    const open = document.body.classList.toggle('sb-open');
    document.getElementById('sb-overlay').style.display = open ? 'block' : 'none';
  };

  window.closeSidebar = function () {
    document.body.classList.remove('sb-open');
    const ov = document.getElementById('sb-overlay');
    if (ov) ov.style.display = 'none';
  };

  // Atualiza dados do usuário no sidebar (chamado por main.js após autenticar)
  window.updateSidebarUser = function (perfil) {
    const sbNome   = document.getElementById('sbNome');
    const sbAvatar = document.getElementById('sbAvatar');
    const sbRole   = document.getElementById('sbRole');
    if (sbNome && perfil.usuario)   sbNome.textContent   = perfil.usuario;
    if (sbAvatar && perfil.usuario) sbAvatar.textContent = perfil.usuario[0].toUpperCase();
    if (sbRole && perfil.role) {
      sbRole.textContent = { admin: 'Administrador', supervisor: 'Supervisor', agente: 'Agente GCM' }[perfil.role] || perfil.role;
    }

    // Reconstrói o nav com os itens corretos para o role recém-carregado
    const nav = document.querySelector('.sb-nav');
    if (nav && perfil.role) {
      const ROLES_VALIDOS = ['admin', 'supervisor', 'agente'];
      const roleEfetivo = ROLES_VALIDOS.includes(perfil.role) ? perfil.role : 'agente';
      const currentPath = window.location.pathname;
      nav.innerHTML = MENU
        .filter(item => item.roles.includes(roleEfetivo))
        .map(item => {
          const active = currentPath.includes(item.href.replace('/pages/', '')) ? ' active' : '';
          return `<a href="${item.href}" class="sb-link${active}">${item.label}</a>`;
        }).join('');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildSidebar);
  } else {
    buildSidebar();
  }
})();

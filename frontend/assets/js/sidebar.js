// Injeta menu lateral em todas as páginas protegidas
(function () {
  const path = window.location.pathname;
  const skipPages = ['index.html', 'setup.html', 'aviso-lgpd.html'];
  if (path === '/' || skipPages.some(p => path.endsWith(p))) return;

  const MENU = [
    { href: '/pages/home.html',       label: 'Início' },
    { href: '/pages/dashboard.html',  label: 'Novo BO' },
    { href: '/pages/consulta.html',   label: 'Histórico de BOs' },
    { href: '/pages/relatorio.html',  label: 'Relatório Interno' },
    { href: '/pages/viatura.html',    label: 'Controle de Viatura' },
    { href: '/pages/documentos.html', label: 'Documentos' },
  ];
  const ADMIN_MENU = [
    { href: '/pages/usuarios.html', label: 'Usuários' },
  ];

  function buildSidebar() {
    const perfil = JSON.parse(sessionStorage.getItem('perfil') || '{}');
    const isPrivileged = perfil.role === 'admin' || perfil.role === 'supervisor';
    const allMenu = isPrivileged ? [...MENU, ...ADMIN_MENU] : MENU;

    const navHTML = allMenu.map(item => {
      const active = window.location.pathname.includes(item.href.replace('/pages/', '')) ? ' active' : '';
      return `<a href="${item.href}" class="sb-link${active}">${item.label}</a>`;
    }).join('');

    const roleLabel = { admin: 'Administrador', supervisor: 'Supervisor', agente: 'Agente GCM' }[perfil.role] || 'GCM';
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

    // Remove elementos duplicados do cabeçalho que agora ficam no sidebar
    const headerActionDiv = document.querySelector('.header > div:not(.header-titulo)');
    if (headerActionDiv) headerActionDiv.remove();
    const legacyUserSpan = document.getElementById('usuarioLogado');
    if (legacyUserSpan) legacyUserSpan.closest('div')?.remove();
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
    if (sbNome && perfil.usuario)  sbNome.textContent   = perfil.usuario;
    if (sbAvatar && perfil.usuario) sbAvatar.textContent = perfil.usuario[0].toUpperCase();
    if (sbRole && perfil.role) {
      sbRole.textContent = { admin: 'Administrador', supervisor: 'Supervisor', agente: 'Agente GCM' }[perfil.role] || perfil.role;
    }
    // Adiciona link de Usuários para perfis privilegiados
    if (perfil.role === 'admin' || perfil.role === 'supervisor') {
      const nav = document.querySelector('.sb-nav');
      if (nav && !nav.querySelector('[href*="usuarios"]')) {
        nav.insertAdjacentHTML('beforeend', `<a href="/pages/usuarios.html" class="sb-link">Usuários</a>`);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildSidebar);
  } else {
    buildSidebar();
  }
})();

// Injeta menu lateral em todas as páginas protegidas
(function () {
  const path = window.location.pathname;
  const skipPages = ['index.html', 'setup.html', 'aviso-lgpd.html'];
  if (path === '/' || skipPages.some(p => path.endsWith(p))) return;

  // Carregada dentro do modal flutuante (iframe): mostra só o conteúdo da
  // página, sem duplicar cabeçalho/sidebar/timers — quem cuida disso é a
  // janela de cima (top).
  const inIframe = window.self !== window.top;

  const ICONS = {
    home:      `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M7 18v-6h6v6"/></svg>`,
    novobo:    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="12" height="14" rx="1.5"/><path d="M8 10h4M10 8v4"/><path d="M7 6h3"/></svg>`,
    historico: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8.5" r="4.5"/><path d="M15.5 15.5l-3-3"/><path d="M8.5 6.5v2.2l1.3 1.3"/></svg>`,
    relatorio: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="1.5"/><path d="M7 13v-3M10 13V7M13 13v-5"/></svg>`,
    viatura:   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="16" height="7" rx="1.5"/><path d="M4 8l2-4h8l2 4"/><circle cx="6" cy="15" r="1.5"/><circle cx="14" cy="15" r="1.5"/></svg>`,
    documentos:`<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2H6a2 2 0 01-2-2V5z"/><path d="M11 3v5h5"/></svg>`,
    perfil:    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="3.5"/><path d="M3 18c0-3.87 3.13-7 7-7s7 3.13 7 7"/></svg>`,
    logs:      `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="12" height="14" rx="1.5"/><path d="M7 7h6M7 10h6M7 13h4"/></svg>`,
    usuarios:  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="7" r="3"/><path d="M1 17c0-3.31 2.91-6 6.5-6"/><circle cx="14" cy="8" r="2.5"/><path d="M19 17c0-2.76-2.24-5-5-5"/></svg>`,
  };

  const MENU = [
    { href: '/pages/home.html',       icon: ICONS.home,       label: 'Início',              roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/dashboard.html',  icon: ICONS.novobo,     label: 'Novo BO',             roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/consulta.html',   icon: ICONS.historico,  label: 'Histórico de BOs',    roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/relatorio.html',  icon: ICONS.relatorio,  label: 'Relatório Interno',   roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/viatura.html',    icon: ICONS.viatura,    label: 'Controle de Viatura', roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/documentos.html', icon: ICONS.documentos, label: 'Documentos',          roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/perfil.html',     icon: ICONS.perfil,     label: 'Meu Perfil',          roles: ['agente', 'supervisor', 'admin'] },
    { href: '/pages/logs.html',       icon: ICONS.logs,       label: 'Log de Auditoria',    roles: ['supervisor', 'admin'] },
    { href: '/pages/usuarios.html',   icon: ICONS.usuarios,   label: 'Usuários',            roles: ['admin'] },
  ];

  function buildSidebar() {
    const perfil = JSON.parse(sessionStorage.getItem('perfil') || '{}');
    const ROLES_VALIDOS = ['admin', 'supervisor', 'agente'];
    const roleEfetivo = ROLES_VALIDOS.includes(perfil.role) ? perfil.role : 'agente';
    const allMenu = MENU.filter(item => item.roles.includes(roleEfetivo));

    const navHTML = allMenu.map(item => {
      const active = window.location.pathname.includes(item.href.replace('/pages/', '')) ? ' active' : '';
      return `<a href="${item.href}" class="sb-link${active}" onclick="closeSidebar()"><span class="sb-icon">${item.icon}</span><span>${item.label}</span></a>`;
    }).join('');

    const roleLabel = { admin: 'Administrador', supervisor: 'Supervisor', agente: 'Agente GCM' }[roleEfetivo] || 'Agente GCM';
    const initial = (perfil.usuario || '?')[0].toUpperCase();
    const avatarContent = perfil.foto
      ? `<img src="${perfil.foto}" alt="Foto de perfil">`
      : initial;

    const aside = document.createElement('aside');
    aside.id = 'sidebar';
    aside.innerHTML = `
      <div class="sb-user">
        <div class="sb-avatar" id="sbAvatar">${avatarContent}</div>
        <div class="sb-user-info">
          <span class="sb-user-name" id="sbNome">${perfil.usuario || '—'}</span>
          <span class="sb-user-role" id="sbRole">${roleLabel}</span>
        </div>
      </div>
      <nav class="sb-nav">${navHTML}</nav>
      <div class="sb-footer">
        <button class="sb-btn-sair" onclick="logout()">Sair do Sistema</button>
      </div>
    `;

    // Overlay para fechar ao clicar fora (permanece no body, fora do shell)
    const overlay = document.createElement('div');
    overlay.id = 'sb-overlay';
    overlay.onclick = closeSidebar;

    // app-content recebe todo o conteúdo atual do body
    const wrapper = document.createElement('div');
    wrapper.id = 'app-content';
    Array.from(document.body.children).forEach(c => wrapper.appendChild(c));

    // Extrai o header do app-content para colocá-lo acima do shell-body
    const headerEl = wrapper.querySelector('header.header, .header');

    // shell-body agrupa sidebar + app-content lado a lado
    const shellBody = document.createElement('div');
    shellBody.id = 'shell-body';
    shellBody.appendChild(aside);
    shellBody.appendChild(wrapper);

    // app-shell é o card flutuante principal
    const appShell = document.createElement('div');
    appShell.id = 'app-shell';
    if (headerEl) {
      wrapper.removeChild(headerEl);
      const actionsRow = document.createElement('div');
      actionsRow.className = 'header-actions-row';
      actionsRow.innerHTML = `
        <button class="header-icon-btn" id="hdr-btn-menu" title="Menu" onclick="window.toggleSidebar()">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 5h14M3 10h14M3 15h14"/></svg>
        </button>
        <div class="header-tema-wrapper" id="hdr-tema-wrapper">
          <button class="header-icon-btn" id="hdr-btn-tema" title="Tema" onclick="window.toggleTemaMenu()">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5a7.5 7.5 0 1 0 7.5 7.5c0-1.38-1.12-2.5-2.5-2.5h-1.25c-.69 0-1.25-.56-1.25-1.25V5c0-1.38-1.12-2.5-2.5-2.5z"/><circle cx="6.5" cy="8.5" r="1" fill="currentColor" stroke="none"/><circle cx="8.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="11.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="13.5" cy="8.5" r="1" fill="currentColor" stroke="none"/></svg>
          </button>
          <div class="header-tema-menu" id="hdr-tema-menu">
            <button class="sb-tema-item" data-theme="gov-modern"      onclick="window.aplicarTema('gov-modern')"><span class="sb-tema-dot" style="background:#2171B5"></span>Gov Modern</button>
            <button class="sb-tema-item" data-theme="dark-command"    onclick="window.aplicarTema('dark-command')"><span class="sb-tema-dot" style="background:#1E3A5F"></span>Dark Command</button>
            <button class="sb-tema-item" data-theme="google-material" onclick="window.aplicarTema('google-material')"><span class="sb-tema-dot" style="background:#1A73E8"></span>Claro Operacional</button>
          </div>
        </div>`;
      headerEl.appendChild(actionsRow);
      appShell.appendChild(headerEl);
    }
    appShell.appendChild(shellBody);

    document.body.appendChild(appShell);
    document.body.appendChild(overlay);
    document.body.classList.add('has-sidebar');

    // Marca o tema ativo no menu
    _marcarTemaAtivo();

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
    const headerActionDiv = document.querySelector('.header > div:not(.header-titulo):not(.header-actions-row)');
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
    if (window.matchMedia('(min-width:1025px)').matches) {
      document.body.classList.toggle('sb-collapsed');
      return;
    }
    const open = document.body.classList.toggle('sb-open');
    document.getElementById('sb-overlay').style.display = open ? 'block' : 'none';
  };

  function _marcarTemaAtivo() {
    const cur = localStorage.getItem('gcm-tema') || 'gov-modern';
    document.querySelectorAll('.sb-tema-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === cur);
    });
  }

  window.toggleTemaMenu = function () {
    const menu = document.getElementById('hdr-tema-menu');
    const btn  = document.getElementById('hdr-btn-tema');
    if (menu && btn && !menu.classList.contains('open')) {
      const r = btn.getBoundingClientRect();
      menu.style.top  = (r.bottom + 10) + 'px';
      menu.style.left = r.left + 'px';
    }
    if (menu) menu.classList.toggle('open');
  };

  window.aplicarTema = function (tema) {
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('gcm-tema', tema);
    _marcarTemaAtivo();
    const menu = document.getElementById('hdr-tema-menu');
    if (menu) menu.classList.remove('open');
  };

  // Fecha o menu ao clicar fora
  document.addEventListener('click', function (e) {
    const wrapper = document.getElementById('hdr-tema-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      const menu = document.getElementById('hdr-tema-menu');
      if (menu) menu.classList.remove('open');
    }
  });

  window.closeSidebar = function () {
    document.body.classList.remove('sb-open');
    const ov = document.getElementById('sb-overlay');
    if (ov) ov.style.display = 'none';
  };

  // ── Navegação em modal flutuante (telas e forms abrem sobre a página atual) ─
  window.openPageModal = function (href, title) {
    closeSidebar();
    let overlay = document.getElementById('pg-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pg-overlay';
      overlay.className = 'pg-overlay';
      overlay.innerHTML = `
        <div class="pg-modal">
          <div class="pg-modal-head">
            <span class="pg-modal-title"></span>
            <button class="pg-modal-close" title="Fechar" onclick="window.closePageModal()">&times;</button>
          </div>
          <iframe class="pg-modal-frame"></iframe>
        </div>`;
      overlay.addEventListener('click', e => { if (e.target === overlay) window.closePageModal(); });
      document.body.appendChild(overlay);
    }
    overlay.querySelector('.pg-modal-title').textContent = title || '';
    overlay.querySelector('.pg-modal-frame').src = href;
    overlay.classList.add('aberto');
    document.querySelectorAll('.sb-link').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === href);
    });
  };

  window.closePageModal = function () {
    const overlay = document.getElementById('pg-overlay');
    if (!overlay) return;
    overlay.classList.remove('aberto');
    overlay.querySelector('.pg-modal-frame').src = 'about:blank';
  };

  // Intercepta links internos para abrir como modal flutuante (exceto Início)
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a[href^="/pages/"]');
    if (!a || a.target === '_blank' || a.href.endsWith('home.html')) return;
    e.preventDefault();
    window.openPageModal(a.getAttribute('href'), a.textContent.trim());
  });

  // Atualiza dados do usuário no sidebar (chamado por main.js após autenticar)
  window.updateSidebarUser = function (perfil) {
    const sbNome   = document.getElementById('sbNome');
    const sbAvatar = document.getElementById('sbAvatar');
    const sbRole   = document.getElementById('sbRole');
    if (sbNome && perfil.usuario)   sbNome.textContent   = perfil.usuario;
    if (sbAvatar) {
      if (perfil.foto) {
        sbAvatar.innerHTML = `<img src="${perfil.foto}" alt="Foto de perfil">`;
      } else if (perfil.usuario) {
        sbAvatar.textContent = perfil.usuario[0].toUpperCase();
      }
    }
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
          return `<a href="${item.href}" class="sb-link${active}" onclick="closeSidebar()"><span class="sb-icon">${item.icon}</span><span>${item.label}</span></a>`;
        }).join('');
    }
  };

  // ── Timer de inatividade de sessão ───────────────────────────────────────
  let _inativMinutos  = 30;   // sobrescrito após /api/auth/me
  let _timerInativ    = null;
  let _timerAviso     = null;
  let _avisoPendente  = false;

  const AVISO_ANTECEDENCIA_S = 5 * 60; // aviso 5 min antes

  function iniciarTimerInatividade(minutos) {
    _inativMinutos = minutos || 30;
    _resetarTimer();

    const eventos = ['mousemove','mousedown','keydown','touchstart','scroll','click'];
    eventos.forEach(ev => document.addEventListener(ev, _resetarTimer, { passive: true }));
  }

  function _resetarTimer() {
    clearTimeout(_timerInativ);
    clearTimeout(_timerAviso);

    // Se aviso estava visível, fecha-o pois houve atividade
    if (_avisoPendente) {
      _fecharAvisoInatividade();
    }

    const totalMs  = _inativMinutos * 60 * 1000;
    const avisoMs  = totalMs - AVISO_ANTECEDENCIA_S * 1000;

    // Aviso antecipado
    if (avisoMs > 0) {
      _timerAviso = setTimeout(_mostrarAvisoInatividade, avisoMs);
    }

    // Logout por inatividade
    _timerInativ = setTimeout(_logoutPorInatividade, totalMs);
  }

  function _mostrarAvisoInatividade() {
    if (_avisoPendente) return;
    _avisoPendente = true;

    const style = document.createElement('style');
    style.id = 'style-inativ';
    style.textContent = `
      #modal-inativ {
        position:fixed; inset:0; z-index:99998;
        background:rgba(0,0,0,0.6); backdrop-filter:blur(3px);
        display:flex; align-items:center; justify-content:center; padding:20px;
      }
      #modal-inativ .mi-card {
        background:#fff; border-radius:12px; padding:32px 28px;
        max-width:400px; width:100%; text-align:center;
        box-shadow:0 16px 48px rgba(0,0,0,0.35);
      }
      #modal-inativ .mi-icon  { font-size:2.8rem; margin-bottom:10px; }
      #modal-inativ .mi-title { font-size:1.05rem; font-weight:800; color:#92400E; margin-bottom:8px; }
      #modal-inativ .mi-msg   { font-size:0.88rem; color:#6B7280; margin-bottom:6px; }
      #modal-inativ .mi-cnt   { font-size:1.6rem; font-weight:800; color:#DC2626; margin:10px 0 18px; }
      #modal-inativ .mi-btn   {
        background:#1E3A5F; color:#fff; border:none; border-radius:8px;
        padding:11px 24px; font-size:0.95rem; font-weight:700; cursor:pointer; width:100%;
      }
      #modal-inativ .mi-btn:hover { background:#162d4a; }
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'modal-inativ';
    modal.innerHTML = `
      <div class="mi-card">
        <div class="mi-icon">⏱️</div>
        <div class="mi-title">Sessão prestes a expirar</div>
        <div class="mi-msg">Você está inativo. A sessão será encerrada em:</div>
        <div class="mi-cnt" id="mi-contador">${AVISO_ANTECEDENCIA_S}</div>
        <div class="mi-msg" style="margin-bottom:16px;font-size:0.8rem;">segundos</div>
        <button class="mi-btn" onclick="window._manterSessao()">Continuar conectado</button>
      </div>
    `;
    document.body.appendChild(modal);

    // Contador regressivo
    let restante = AVISO_ANTECEDENCIA_S;
    const contadorEl = document.getElementById('mi-contador');
    const tick = setInterval(() => {
      restante--;
      if (contadorEl) contadorEl.textContent = restante;
      if (restante <= 0) clearInterval(tick);
    }, 1000);
    modal._tick = tick;
  }

  function _fecharAvisoInatividade() {
    _avisoPendente = false;
    const modal = document.getElementById('modal-inativ');
    if (modal) { clearInterval(modal._tick); modal.remove(); }
    const s = document.getElementById('style-inativ');
    if (s) s.remove();
  }

  async function _logoutPorInatividade() {
    _fecharAvisoInatividade();
    try {
      await fetch(`${window.API_BASE_URL || ''}/api/auth/logout-inatividade`, {
        method: 'POST', credentials: 'include'
      });
    } catch {}
    sessionStorage.removeItem('perfil');
    window.location.href = '/?motivo=inatividade';
  }

  window._manterSessao = function () {
    _resetarTimer();
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── Verificação de atualização de dados a cada 6 meses ──────────────────
  const MESES_LIMITE = 6;
  const PAGINA_PERFIL = '/pages/perfil.html';
  const estouNoPerfil = window.location.pathname.endsWith('perfil.html');

  async function verificarAtualizacaoDados(usuarioLogado) {
    try {
      const res = await fetch(`${window.API_BASE_URL || ''}/api/agentes`, { credentials: 'include' });
      if (!res.ok) return;
      const agentes = await res.json();
      const ag = agentes.find(a => a.usuario === usuarioLogado);
      if (!ag) return;

      const referencia = ag.atualizado_em || ag.criado_em;
      if (!referencia) return;

      const diasPassados = (Date.now() - new Date(referencia).getTime()) / (1000 * 60 * 60 * 24);
      const limiteDias  = MESES_LIMITE * 30;

      if (diasPassados < limiteDias) return; // dados em dia

      // Quantos dias além do prazo
      const diasAtraso = Math.floor(diasPassados - limiteDias);
      const dataRef    = new Date(referencia).toLocaleDateString('pt-BR');

      if (estouNoPerfil) {
        // Na página de perfil: apenas banner de aviso
        mostrarBannerAviso(dataRef, diasAtraso);
      } else {
        // Nas demais páginas: overlay de bloqueio total
        mostrarBloqueio(dataRef, diasAtraso);
      }
    } catch { /* não bloqueia em caso de falha de rede */ }
  }

  function mostrarBannerAviso(dataRef, diasAtraso) {
    const style = document.createElement('style');
    style.textContent = `
      #banner-dados {
        position: fixed; top: var(--header-h, 60px); left: 0; right: 0; z-index: 9000;
        background: #FEF3C7; border-bottom: 3px solid #F59E0B;
        color: #92400E; padding: 12px 20px;
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; font-size: 0.88rem; font-weight: 600; flex-wrap: wrap;
      }
      #banner-dados .banner-msg { flex: 1; }
      #banner-dados .banner-acao {
        background: #F59E0B; color: #fff; border: none;
        border-radius: 6px; padding: 7px 16px; cursor: pointer;
        font-weight: 700; font-size: 0.85rem; white-space: nowrap;
      }
      #banner-dados .banner-acao:hover { background: #D97706; }
    `;
    document.head.appendChild(style);

    const banner = document.createElement('div');
    banner.id = 'banner-dados';
    banner.innerHTML = `
      <span class="banner-msg">
        ⚠️ Seus dados de contato não são atualizados desde <strong>${dataRef}</strong>
        (${diasAtraso} dia(s) além do prazo de ${MESES_LIMITE} meses).
        Atualize antes de sair desta página.
      </span>
      <button class="banner-acao" onclick="window.scrollTo({top:document.getElementById('cardContato')?.offsetTop-80,behavior:'smooth'})">
        Atualizar Agora
      </button>
    `;
    document.body.appendChild(banner);
  }

  function mostrarBloqueio(dataRef, diasAtraso) {
    const style = document.createElement('style');
    style.textContent = `
      #overlay-dados {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center; padding: 20px;
      }
      #overlay-dados .od-card {
        background: #fff; border-radius: 12px; padding: 36px 32px;
        max-width: 460px; width: 100%; text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.4);
      }
      #overlay-dados .od-icon  { font-size: 3rem; margin-bottom: 12px; }
      #overlay-dados .od-title {
        font-size: 1.15rem; font-weight: 800; color: #1E3A5F; margin-bottom: 10px;
      }
      #overlay-dados .od-msg {
        font-size: 0.9rem; color: #4B5563; margin-bottom: 8px; line-height: 1.55;
      }
      #overlay-dados .od-meta {
        font-size: 0.8rem; color: #9CA3AF; margin-bottom: 24px;
      }
      #overlay-dados .od-btn {
        display: block; width: 100%; background: #1E3A5F; color: #fff;
        border: none; border-radius: 8px; padding: 13px;
        font-size: 1rem; font-weight: 700; cursor: pointer;
        text-decoration: none; transition: background 0.2s;
      }
      #overlay-dados .od-btn:hover { background: #162d4a; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'overlay-dados';
    overlay.innerHTML = `
      <div class="od-card">
        <div class="od-icon">🔒</div>
        <div class="od-title">Dados de Contato Desatualizados</div>
        <div class="od-msg">
          Por norma interna, os dados de contato de cada servidor devem ser revisados
          a cada <strong>${MESES_LIMITE} meses</strong>. Seu cadastro está desatualizado
          há <strong>${diasAtraso} dia(s)</strong>.
        </div>
        <div class="od-meta">Última atualização registrada: ${dataRef}</div>
        <a class="od-btn" href="${PAGINA_PERFIL}">Atualizar Meus Dados Agora</a>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (inIframe) {
    // Injeta estilo imediatamente (antes do body estar disponível) para ocultar o header e liberar scroll
    const _s = document.createElement('style');
    _s.textContent = '.header { display: none !important; } html, body { overflow: auto !important; height: auto !important; }';
    (document.head || document.documentElement).appendChild(_s);
    if (document.body) {
      document.body.classList.add('in-page-modal');
    } else {
      document.addEventListener('DOMContentLoaded', () => document.body.classList.add('in-page-modal'));
    }
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildSidebar);
  } else {
    buildSidebar();
  }

  // Aguarda o perfil ser carregado e então inicia verificações
  async function aguardarPerfilEVerificar(tentativas) {
    if (tentativas <= 0) return;
    const perfil = JSON.parse(sessionStorage.getItem('perfil') || '{}');
    if (perfil.usuario) {
      verificarAtualizacaoDados(perfil.usuario);
      // Busca timeout configurado no servidor
      try {
        const r = await fetch(`${window.API_BASE_URL || ''}/api/auth/me`, { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          iniciarTimerInatividade(d.inatividade_minutos || 30);
        }
      } catch { iniciarTimerInatividade(30); }
    } else {
      setTimeout(() => aguardarPerfilEVerificar(tentativas - 1), 600);
    }
  }
  if (!inIframe) setTimeout(() => aguardarPerfilEVerificar(5), 800);
})();

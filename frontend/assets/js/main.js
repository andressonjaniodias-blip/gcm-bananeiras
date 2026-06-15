// Sessão controlada por cookie httpOnly — o token não fica exposto no JS
// Os dados do usuário logado são guardados em sessionStorage apenas para exibição na UI
let authToken = null; // mantido para compatibilidade com código legado

window.addEventListener('DOMContentLoaded', async () => {
  const isLoginPage = window.location.pathname === '/' ||
    window.location.pathname.endsWith('index.html');
  const isSetupPage = window.location.pathname.includes('setup');

  if (isLoginPage || isSetupPage) {
    // Verifica se já está autenticado (cookie válido)
    if (isLoginPage) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
        if (res.ok) {
          window.location.href = '/pages/dashboard.html';
          return;
        }
      } catch {}
    }
    return;
  }

  // Páginas protegidas: valida sessão
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
    if (!res.ok) { window.location.href = '/'; return; }
    const perfil = await res.json();
    sessionStorage.setItem('perfil', JSON.stringify(perfil));

    // Atualiza sidebar com dados do perfil
    if (typeof updateSidebarUser === 'function') updateSidebarUser(perfil);
  } catch { window.location.href = '/'; return; }

  // Dashboard: inicia com um form de cada seção
  const isDashboard = window.location.pathname.includes('dashboard');
  if (isDashboard) {
    adicionarVitima();
    adicionarSuspeito();
    adicionarObjeto();
    iniciarAutosave();
    // Move modais para o body para evitar clipping pelo overflow:hidden do #app-shell
    ['modal-bo-concluido', 'modal-pdf-opts'].forEach(id => {
      const el = document.getElementById(id);
      if (el) document.body.appendChild(el);
    });
  }

  // Restaurar rascunho
  const rascunho = sessionStorage.getItem('boTemp');
  if (rascunho) {
    try {
      const dados = JSON.parse(rascunho);
      restaurarRascunho(dados);
    } catch {}
  }

  _renderMobileNav();
});

// ── Navegação de abas ────────────────────────────────────────────────────────
const TAB_ORDER = ['solicitacao','ocorrencia','vitima','suspeito','relato','anexos','objetos','autoridade'];

function _validarAbaAtual() {
  const current = document.querySelector('.tab-content:not(.hidden)');
  if (!current) return true;
  const invalidos = [...current.querySelectorAll('[required]')].filter(f => !f.value.trim());
  if (!invalidos.length) return true;

  // Destaca os inválidos e exibe toast
  invalidos.forEach(f => {
    f.classList.add('campo-invalido');
    f.addEventListener('input', () => f.classList.remove('campo-invalido'), { once: true });
  });
  invalidos[0].focus({ preventScroll: false });
  _toastErro('Preencha os campos obrigatórios antes de continuar.');
  return false;
}

function _toastErro(msg) { showToast(msg, 'danger'); }

function showToast(msg, tipo = 'danger') {
  document.getElementById('tab-toast')?.remove();
  const cores = {
    danger:  { bg: '#C62828', color: '#fff' },
    success: { bg: '#1B5E20', color: '#fff' },
    warning: { bg: '#E65100', color: '#fff' },
    info:    { bg: '#0D47A1', color: '#fff' },
  };
  const { bg, color } = cores[tipo] || cores.danger;
  const t = document.createElement('div');
  t.id = 'tab-toast';
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'90px', left:'50%', transform:'translateX(-50%)',
    background: bg, color, padding:'10px 20px',
    borderRadius:'8px', fontSize:'0.88rem', fontWeight:'600',
    zIndex:'9999', boxShadow:'0 4px 16px rgba(0,0,0,0.3)',
    whiteSpace:'nowrap', pointerEvents:'none',
    animation:'fadeInUp 0.2s ease'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Modal de confirmação — retorna Promise<boolean>
function confirmar(mensagem, titulo = 'Confirmar') {
  return new Promise(resolve => {
    document.getElementById('_confirm-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = '_confirm-modal';
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', background:'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:'10000'
    });
    overlay.innerHTML = `
      <div style="background:var(--bg-card,#fff);border-radius:12px;padding:28px 32px;max-width:420px;width:90%;
                  box-shadow:0 8px 32px rgba(0,0,0,0.25);font-family:inherit;">
        <h3 style="margin:0 0 12px;font-size:1rem;color:var(--color-text,#111)">${titulo}</h3>
        <p style="margin:0 0 24px;font-size:0.9rem;color:var(--color-text-muted,#555);line-height:1.5">${mensagem}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="_confirm-no"
            style="padding:8px 20px;border-radius:8px;border:1px solid var(--color-border,#ccc);
                   background:transparent;cursor:pointer;font-size:0.9rem;color:var(--color-text,#111)">
            Cancelar
          </button>
          <button id="_confirm-yes"
            style="padding:8px 20px;border-radius:8px;border:none;
                   background:#C62828;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600">
            Confirmar
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#_confirm-yes').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#_confirm-no').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

function showTab(tabId, scroll) {
  const current = document.querySelector('.tab-content:not(.hidden)');
  const currentId = current?.id;
  const currentIdx = TAB_ORDER.indexOf(currentId);
  const targetIdx  = TAB_ORDER.indexOf(tabId);

  // Bloqueia avanço se aba atual tem campos obrigatórios vazios
  if (targetIdx > currentIdx && !_validarAbaAtual()) return;

  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const section = document.getElementById(tabId);
  section?.classList.remove('hidden');
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`)?.classList.add('active');
  if (scroll !== false && window.innerWidth <= 768) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  _renderMobileNav();
}

function _renderMobileNav() {
  document.querySelectorAll('.mobile-tab-nav').forEach(el => el.remove());
  if (window.innerWidth > 768) return;
  const visible = document.querySelector('.tab-content:not(.hidden)');
  if (!visible) return;
  const idx = TAB_ORDER.indexOf(visible.id);
  if (idx === -1) return;
  const nav = document.createElement('div');
  nav.className = 'mobile-tab-nav';
  if (idx > 0) {
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'mobile-nav-btn mobile-nav-prev';
    prev.textContent = '← Anterior';
    prev.onclick = () => showTab(TAB_ORDER[idx - 1]);
    nav.appendChild(prev);
  } else {
    nav.appendChild(document.createElement('span'));
  }
  const counter = document.createElement('span');
  counter.className = 'mobile-nav-counter';
  counter.textContent = `${idx + 1} / ${TAB_ORDER.length}`;
  nav.appendChild(counter);
  if (idx < TAB_ORDER.length - 1) {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'mobile-nav-btn mobile-nav-next';
    next.textContent = 'Próximo →';
    next.onclick = () => showTab(TAB_ORDER[idx + 1]);
    nav.appendChild(next);
  } else {
    nav.appendChild(document.createElement('span'));
  }
  visible.appendChild(nav);
}

window.addEventListener('resize', _renderMobileNav);

// ── Máscaras ─────────────────────────────────────────────────────────────────
function mascararCPF(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/, '$1.$2');
  input.value = v;
}

function mascararRG(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 9);
  if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1})/, '$1.$2.$3-$4');
  else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,3})/, '$1.$2');
  input.value = v;
}

// Valida dígito verificador do CPF (retorna true se válido ou vazio)
function cpfValido(cpf) {
  const n = cpf.replace(/\D/g, '');
  if (!n) return true; // campo opcional — só valida se preenchido
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(n[i]) * (10 - i);
  let r = (soma * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(n[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(n[i]) * (11 - i);
  r = (soma * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(n[10]);
}

function validarCPFInput(input) {
  if (!cpfValido(input.value)) {
    input.classList.add('campo-invalido');
    showToast('CPF inválido: ' + (input.closest('.bloco-pessoa')?.querySelector('[name="nome"]')?.value || input.value), 'danger');
  } else {
    input.classList.remove('campo-invalido');
  }
}

function mascararTelefone(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
  input.value = v;
}

// ── Blocos dinâmicos ─────────────────────────────────────────────────────────
function htmlPessoa(tipo, idx) {
  return `
  <div class="bloco-pessoa" data-tipo="${tipo}">
    <div class="bloco-header">
      <h4>${tipo} ${idx}</h4>
    </div>
    <div class="campo-group"><label>Nome</label>
      <input type="text" name="nome" placeholder="Nome completo" maxlength="150"></div>
    <div class="campo-group"><label>Alcunha</label>
      <input type="text" name="alcunha" placeholder="Apelido" maxlength="100"></div>
    <div class="campo-group"><label>CPF</label>
      <input type="text" name="cpf" placeholder="000.000.000-00" maxlength="14" oninput="mascararCPF(this)" onblur="validarCPFInput(this)"></div>
    <div class="campo-group"><label>RG</label>
      <input type="text" name="rg" placeholder="00.000.000-0" maxlength="12" oninput="mascararRG(this)"></div>
    <div class="campo-group"><label>Nascimento</label>
      <input type="date" name="nascimento"></div>
    <div class="campo-group"><label>Idade</label>
      <input type="number" name="idade" min="0" max="120" placeholder="Anos"></div>
    <div class="campo-group"><label>Gênero</label>
      <input type="text" name="genero" placeholder="Gênero declarado" maxlength="50"></div>
    <div class="campo-group"><label>Nacionalidade</label>
      <input type="text" name="nacionalidade" placeholder="Ex: Brasileira" maxlength="50"></div>
    <div class="campo-group"><label>Naturalidade</label>
      <input type="text" name="naturalidade" placeholder="Cidade/Estado" maxlength="100"></div>
    <div class="campo-group"><label>Estado Civil</label>
      <select name="estadoCivil">
        <option value="">Selecione</option>
        <option>Solteiro(a)</option><option>Casado(a)</option>
        <option>Divorciado(a)</option><option>Viúvo(a)</option><option>União Estável</option>
      </select></div>
    <div class="campo-group"><label>Ocupação</label>
      <input type="text" name="ocupacao" placeholder="Profissão" maxlength="100"></div>
    <div class="campo-group"><label>Escolaridade</label>
      <select name="escolaridade">
        <option value="">Selecione</option>
        <option>Sem instrução</option><option>Fundamental Incompleto</option>
        <option>Fundamental Completo</option><option>Médio Incompleto</option>
        <option>Médio Completo</option><option>Superior Incompleto</option>
        <option>Superior Completo</option>
      </select></div>
    <div class="campo-group"><label>Nome do Pai</label>
      <input type="text" name="nomePai" placeholder="Nome do pai" maxlength="150"></div>
    <div class="campo-group"><label>Nome da Mãe</label>
      <input type="text" name="nomeMae" placeholder="Nome da mãe" maxlength="150"></div>
    <div class="campo-group"><label>Endereço</label>
      <input type="text" name="endereco" placeholder="Rua, Nº" maxlength="250"></div>
    <div class="campo-group"><label>Bairro</label>
      <input type="text" name="bairro" placeholder="Bairro" maxlength="100"></div>
    <div class="campo-group"><label>Cidade</label>
      <input type="text" name="cidade" placeholder="Cidade" maxlength="100"></div>
    <div class="campo-group"><label>Telefone</label>
      <input type="tel" name="telefone" placeholder="(00) 00000-0000" maxlength="15" oninput="mascararTelefone(this)"></div>
  </div>`;
}

function htmlObjeto(idx) {
  return `
  <div class="bloco-objeto">
    <div class="bloco-header">
      <h4>Objeto ${idx}</h4>
    </div>
    <div class="campo-group"><label>Tipo de Objeto</label>
      <input type="text" name="tipoObjeto" placeholder="Ex: Faca, Celular, Veículo" maxlength="100"></div>
    <div class="campo-group"><label>Quantidade</label>
      <input type="number" name="quantidade" min="1" placeholder="1"></div>
    <div class="campo-group"><label>Descrição</label>
      <textarea name="descricaoObjeto" rows="3" placeholder="Cor, marca, modelo, características..."></textarea></div>
  </div>`;
}

let countVitimas = 0, countSuspeitos = 0, countObjetos = 0;

function adicionarVitima() {
  countVitimas++;
  document.getElementById('vitimas-list').insertAdjacentHTML('beforeend', htmlPessoa('Vítima', countVitimas));
  atualizarBotaoRemover('vitimas-list', 'btnRemoverVitima');
}

function adicionarSuspeito() {
  countSuspeitos++;
  document.getElementById('suspeitos-list').insertAdjacentHTML('beforeend', htmlPessoa('Suspeito', countSuspeitos));
  atualizarBotaoRemover('suspeitos-list', 'btnRemoverSuspeito');
}

function adicionarObjeto() {
  countObjetos++;
  document.getElementById('objetos-list').insertAdjacentHTML('beforeend', htmlObjeto(countObjetos));
  atualizarBotaoRemover('objetos-list', 'btnRemoverObjeto');
}

function removerUltimoVitima()  { removerUltimoDe('vitimas-list',   'btnRemoverVitima'); }
function removerUltimoSuspeito(){ removerUltimoDe('suspeitos-list', 'btnRemoverSuspeito'); }
function removerUltimoObjeto()  { removerUltimoDe('objetos-list',   'btnRemoverObjeto'); }

function removerUltimoDe(containerId, btnId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const blocos = container.querySelectorAll('.bloco-pessoa, .bloco-objeto');
  if (!blocos.length) return;
  blocos[blocos.length - 1].remove();
  atualizarBotaoRemover(containerId, btnId);
}

function atualizarBotaoRemover(containerId, btnId) {
  const container = document.getElementById(containerId);
  const btn = document.getElementById(btnId);
  if (!btn || !container) return;
  const count = container.querySelectorAll('.bloco-pessoa, .bloco-objeto').length;
  btn.style.display = count > 1 ? 'inline-block' : 'none';
}

// ── Coleta de dados ──────────────────────────────────────────────────────────
function coletarSecao(seletor) {
  const obj = {};
  document.querySelectorAll(`${seletor} input, ${seletor} textarea, ${seletor} select`).forEach(el => {
    if (el.name && el.value.trim()) obj[el.name] = el.value.trim();
  });
  return obj;
}

function coletarBlocos(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} > div`)).map(bloco => {
    const obj = {};
    bloco.querySelectorAll('input, textarea, select').forEach(el => {
      if (el.name && el.value.trim()) obj[el.name] = el.value.trim();
    });
    return obj;
  }).filter(obj => Object.keys(obj).length > 0);
}

function coletarDadosBO() {
  return {
    dadosSolicitacao: coletarSecao('#solicitacao'),
    dadosOcorrencia:  coletarSecao('#ocorrencia'),
    vitimas:   coletarBlocos('vitimas-list'),
    suspeitos: coletarBlocos('suspeitos-list'),
    objetos:   coletarBlocos('objetos-list'),
    relato:    document.querySelector('#relato textarea')?.value.trim() || '',
    autoridade: coletarSecao('#autoridade'),
  };
}

// ── Validação ────────────────────────────────────────────────────────────────
function validarCamposObrigatorios() {
  const obrigatorios = document.querySelectorAll('[required]');
  for (const campo of obrigatorios) {
    if (!campo.value.trim()) {
      const label = campo.closest('.campo-group')?.querySelector('label')?.textContent?.trim() || campo.name;
      const secao = campo.closest('.tab-content');
      if (secao) {
        showTab(secao.id);
        campo.focus();
      }
      showToast(`Campo obrigatório não preenchido: "${label}"`, 'danger');
      return false;
    }
    if (campo.minLength > 0 && campo.value.trim().length < campo.minLength) {
      const label = campo.closest('.campo-group')?.querySelector('label')?.textContent?.trim() || campo.name;
      showToast(`"${label}" deve ter pelo menos ${campo.minLength} caracteres.`, 'danger');
      campo.focus();
      return false;
    }
  }
  return true;
}

// ── Autosave ─────────────────────────────────────────────────────────────────
let _autosaveTimer = null;
function _autosave() {
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => {
    sessionStorage.setItem('boTemp', JSON.stringify(coletarDadosBO()));
  }, 800);
}

let _boEnviado = false;

function iniciarAutosave() {
  const form = document.getElementById('bo-form');
  if (!form) return;
  form.addEventListener('input', _autosave);

  // Avisa ao tentar fechar/navegar com rascunho preenchido
  window.addEventListener('beforeunload', e => {
    if (_boEnviado) return;
    const rascunho = sessionStorage.getItem('boTemp');
    if (!rascunho) return;
    try {
      const dados = JSON.parse(rascunho);
      const temConteudo = Object.values(dados).some(v =>
        v && typeof v === 'string' && v.trim().length > 0
      );
      if (!temConteudo) return;
    } catch { return; }
    e.preventDefault();
    e.returnValue = '';
  });
}

async function finalizarBO() {
  if (!validarCamposObrigatorios()) return;

  const dados = coletarDadosBO();
  if (!dados.relato) {
    showTab('relato');
    showToast('O relato da ocorrência é obrigatório.', 'danger');
    return;
  }

  // Valida todos os CPFs preenchidos
  const cpfsInvalidos = [...document.querySelectorAll('[name="cpf"]')]
    .filter(el => el.value && !cpfValido(el.value));
  if (cpfsInvalidos.length) {
    cpfsInvalidos.forEach(el => el.classList.add('campo-invalido'));
    showToast(`${cpfsInvalidos.length} CPF(s) inválido(s). Corrija antes de finalizar.`, 'danger');
    cpfsInvalidos[0].focus();
    return;
  }

  const ok = await confirmar('Esta ação não poderá ser desfeita.', 'Finalizar Boletim de Ocorrência?');
  if (!ok) return;

  const btnFinalizar = document.getElementById('btn-finalizar');
  if (btnFinalizar) { btnFinalizar.disabled = true; btnFinalizar.textContent = 'Enviando...'; }

  try {
    const response = await fetch(`${API_BASE_URL}/api/bo`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });

    if (response.status === 401) { logout(); return; }

    if (response.ok) {
      const result = await response.json();
      _boEnviado = true;
      sessionStorage.removeItem('boTemp');
      if (_anexosBO.length) {
        await enviarAnexosBO(result.id);
      }
      _boIdAtual = result.id;
      _pdfBOId   = result.id;
      document.getElementById('modal-bo-numero').textContent = result.numero;
      const modal = document.getElementById('modal-bo-concluido');
      if (modal) modal.style.display = 'flex';
    } else {
      const error = await response.json();
      showToast(error.error || 'Erro ao finalizar BO.', 'danger');
      if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.textContent = 'Finalizar BO'; }
    }
  } catch (err) {
    console.error('Erro:', err);
    showToast('Erro de conexão ao finalizar BO.', 'danger');
    if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.textContent = 'Finalizar BO'; }
  }
}

// ── Restaurar rascunho ───────────────────────────────────────────────────────
function restaurarRascunho(dados) {
  function preencherSecao(seletor, obj) {
    if (!obj) return;
    Object.entries(obj).forEach(([name, value]) => {
      const el = document.querySelector(`${seletor} [name="${name}"]`);
      if (el) el.value = value;
    });
  }
  preencherSecao('#solicitacao', dados.dadosSolicitacao);
  preencherSecao('#ocorrencia', dados.dadosOcorrencia);
  preencherSecao('#autoridade', dados.autoridade);
  if (dados.relato) {
    const rel = document.querySelector('#relato textarea');
    if (rel) rel.value = dados.relato;
  }
}

// ── Anexos do BO ─────────────────────────────────────────────────────────────
let _anexosBO    = [];   // File[] pendentes (antes de criar o BO)
let _boIdAtual   = null; // ID do BO após criação (para upload real)

function adicionarAnexosBO(files) {
  for (const f of Array.from(files)) {
    if (_anexosBO.some(x => x.name === f.name && x.size === f.size)) continue; // evita dup
    _anexosBO.push(f);
  }
  renderizarAnexosBO();
}

function removerAnexoBO(idx) {
  _anexosBO.splice(idx, 1);
  renderizarAnexosBO();
}

function renderizarAnexosBO() {
  const lista = document.getElementById('listaAnexosBO');
  if (!lista) return;
  if (!_anexosBO.length) { lista.innerHTML = ''; return; }
  lista.innerHTML = _anexosBO.map((f, i) => {
    const isImg = f.type.startsWith('image/');
    const thumb = isImg
      ? `<img class="anexo-thumb" src="${URL.createObjectURL(f)}" alt="">`
      : `<div class="anexo-thumb" style="background:var(--color-row-alt);display:flex;align-items:center;justify-content:center;font-size:1.4rem;">📄</div>`;
    const kb = (f.size / 1024).toFixed(0);
    return `<div class="anexo-item">
      ${thumb}
      <div class="anexo-info">
        <div class="anexo-nome">${f.name}</div>
        <div class="anexo-meta">${f.type || 'arquivo'} — ${kb} KB</div>
      </div>
      <button class="btn-rm-anexo" onclick="removerAnexoBO(${i})">Remover</button>
    </div>`;
  }).join('');
}

async function enviarAnexosBO(boId) {
  if (!_anexosBO.length) return;
  const fd = new FormData();
  _anexosBO.forEach(f => fd.append('arquivos', f));
  await fetch(`${API_BASE_URL}/api/anexos/bo/${boId}`, {
    method: 'POST', credentials: 'include', body: fd
  });
}

// Drag & drop helpers
function dzOver(e, dzId) {
  e.preventDefault();
  document.getElementById(dzId)?.classList.add('dz-over');
}
function dzOut(dzId) {
  document.getElementById(dzId)?.classList.remove('dz-over');
}
function dzDrop(e, inputId, dzId) {
  e.preventDefault();
  dzOut(dzId);
  const files = e.dataTransfer?.files;
  if (files?.length) {
    const input = document.getElementById(inputId);
    if (input) {
      // Simular seleção no input para reutilizar handler
      const dt = new DataTransfer();
      Array.from(files).forEach(f => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    }
  }
}

// Download de PDF do BO — anexos sempre incluídos
let _pdfBOId = null;
function abrirModalPdfBO(boId) {
  _pdfBOId = boId;
  confirmarPdfBO();
}
async function confirmarPdfBO() {
  if (!_pdfBOId) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/bo/${_pdfBOId}/pdf`, { credentials: 'include' });
    if (!res.ok) { showToast('Erro ao gerar PDF.', 'danger'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `bo_${_pdfBOId}.pdf`; a.click();
    URL.revokeObjectURL(url);
  } catch { showToast('Erro ao exportar PDF.', 'danger'); }
}

// ── Modal de conclusão do BO ─────────────────────────────────────────────────
function _fecharModalBOConcluido() {
  const modal = document.getElementById('modal-bo-concluido');
  if (modal) modal.style.display = 'none';
}

function modalBOBaixarPDF() {
  _fecharModalBOConcluido();
  confirmarPdfBO();
}

async function modalBOCompartilhar() {
  const numero = document.getElementById('modal-bo-numero')?.textContent || '';
  const texto  = `Boletim de Ocorrência registrado pela GCM Bananeiras\nNúmero: ${numero}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: `BO GCM - ${numero}`, text: texto });
      return;
    } catch {}
  }

  // Fallback: WhatsApp
  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank', 'noopener');
}

function modalBOHistorico() {
  window.location.href = '/pages/consulta.html';
}

function modalBONovo() {
  window.location.reload();
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function logout() {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {}
  sessionStorage.removeItem('perfil');
  // limpa token legado caso ainda exista
  localStorage.removeItem('authToken');
  window.location.href = '/';
}

// Login (usado na index)
async function login() {
  const usuario = document.getElementById('usuario')?.value.trim();
  const senha   = document.getElementById('senha')?.value;
  if (!usuario || !senha) { showToast('Usuário e senha são obrigatórios', 'danger'); return; }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });
    const result = await response.json();
    if (response.ok) {
      sessionStorage.setItem('perfil', JSON.stringify({ usuario: result.usuario, role: result.role }));
      if (!result.lgpd_aceito) {
        sessionStorage.setItem('redirecionarApos', 'pages/home.html');
        window.location.href = 'pages/aviso-lgpd.html';
      } else {
        window.location.href = 'pages/home.html';
      }
    } else {
      showToast(result.error || 'Erro ao fazer login', 'danger');
    }
  } catch {
    showToast('Erro de conexão. Verifique se o servidor está rodando.', 'danger');
  }
}

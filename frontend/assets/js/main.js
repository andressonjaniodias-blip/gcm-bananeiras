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
  if (isDashboard && !localStorage.getItem('boTemp')) {
    adicionarVitima();
    adicionarSuspeito();
    adicionarObjeto();
  }

  // Restaurar rascunho
  const rascunho = localStorage.getItem('boTemp');
  if (rascunho) {
    try {
      const dados = JSON.parse(rascunho);
      restaurarRascunho(dados);
    } catch {}
  }
});

// ── Navegação de abas ────────────────────────────────────────────────────────
function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId)?.classList.remove('hidden');
  event?.target?.classList.add('active');
}

// ── Máscaras ─────────────────────────────────────────────────────────────────
function mascararCPF(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/, '$1.$2');
  input.value = v;
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
      <button type="button" class="btn-remover" onclick="removerBloco(this)">Remover</button>
    </div>
    <div class="campo-group"><label>Nome</label>
      <input type="text" name="nome" placeholder="Nome completo" maxlength="150"></div>
    <div class="campo-group"><label>Alcunha</label>
      <input type="text" name="alcunha" placeholder="Apelido" maxlength="100"></div>
    <div class="campo-group"><label>CPF / RG / CNH</label>
      <input type="text" name="documento" placeholder="000.000.000-00" maxlength="20" oninput="mascararCPF(this)"></div>
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
      <input type="text" name="endereco" placeholder="Rua, Nº, Bairro, Cidade" maxlength="250"></div>
    <div class="campo-group"><label>Telefone</label>
      <input type="tel" name="telefone" placeholder="(00) 00000-0000" maxlength="15" oninput="mascararTelefone(this)"></div>
  </div>`;
}

function htmlObjeto(idx) {
  return `
  <div class="bloco-objeto">
    <div class="bloco-header">
      <h4>Objeto ${idx}</h4>
      <button type="button" class="btn-remover" onclick="removerBloco(this)">Remover</button>
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
      alert(`Campo obrigatório não preenchido: "${label}"`);
      return false;
    }
    if (campo.minLength > 0 && campo.value.trim().length < campo.minLength) {
      const label = campo.closest('.campo-group')?.querySelector('label')?.textContent?.trim() || campo.name;
      alert(`"${label}" deve ter pelo menos ${campo.minLength} caracteres.`);
      campo.focus();
      return false;
    }
  }
  return true;
}

// ── Salvar / Finalizar ───────────────────────────────────────────────────────
function salvarBO() {
  const dados = coletarDadosBO();
  localStorage.setItem('boTemp', JSON.stringify(dados));
  alert('Rascunho salvo!');
}

async function finalizarBO() {
  if (!validarCamposObrigatorios()) return;

  const dados = coletarDadosBO();
  if (!dados.relato) {
    showTab('relato');
    alert('O relato da ocorrência é obrigatório.');
    return;
  }

  if (!confirm('Confirmar a finalização do BO? Esta ação não poderá ser desfeita.')) return;

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
      localStorage.removeItem('boTemp');
      alert(`BO finalizado com sucesso!\nNúmero: ${result.numero}`);
      window.location.href = '/pages/consulta.html';
    } else {
      const error = await response.json();
      alert(`Erro: ${error.error}`);
    }
  } catch (err) {
    console.error('Erro:', err);
    alert('Erro de conexão ao finalizar BO.');
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
  if (!usuario || !senha) { alert('Usuário e senha são obrigatórios'); return; }

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
      // Exibir aviso LGPD se ainda não foi aceito
      if (!localStorage.getItem('lgpd_aceito')) {
        sessionStorage.setItem('redirecionarApos', 'pages/home.html');
        window.location.href = 'pages/aviso-lgpd.html';
      } else {
        window.location.href = 'pages/home.html';
      }
    } else {
      alert(result.error || 'Erro ao fazer login');
    }
  } catch {
    alert('Erro de conexão. Verifique se o servidor está rodando.');
  }
}

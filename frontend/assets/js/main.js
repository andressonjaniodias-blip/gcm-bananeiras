// Variável global para armazenar token
let authToken = null;

// Recuperar token ao carregar página
window.addEventListener('DOMContentLoaded', () => {
  authToken = localStorage.getItem('authToken');
  if (!authToken && window.location.pathname !== '/index.html' && !window.location.pathname.endsWith('/')) {
    window.location.href = '/index.html';
  }
});

// Login com validação no backend
async function login() {
  const usuario = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value;

  if (!usuario || !senha) {
    alert('Usuário e senha são obrigatórios');
    return;
  }

  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });

    const result = await response.json();

    if (response.ok) {
      authToken = result.token;
      localStorage.setItem('authToken', authToken);
      window.location.href = 'pages/dashboard.html';
    } else {
      alert(result.error || 'Erro ao fazer login');
    }
  } catch (error) {
    console.error('Erro:', error);
    alert('Erro de conexão. Verifique se o servidor está rodando.');
  }
}

// Fazer logout
function logout() {
  authToken = null;
  localStorage.removeItem('authToken');
  window.location.href = '/index.html';
}

// Função auxiliar para fazer fetch com autenticação
async function fetchComAutenticacao(url, opcoes = {}) {
  if (!authToken) {
    window.location.href = '/index.html';
    return null;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    ...opcoes.headers
  };

  const response = await fetch(url, {
    ...opcoes,
    headers
  });

  // Se token expirou (401), redirecionar para login
  if (response.status === 401) {
    logout();
    return null;
  }

  return response;
}

// Função melhorada para finalizar BO
async function finalizarBO() {
  const dados = coletarDadosBO();

  // Validações básicas
  if (!dados.relato || dados.relato.trim() === '') {
    alert('Relato é obrigatório');
    return;
  }

  if (dados.vitimas.length === 0) {
    alert('Adicione pelo menos uma vítima');
    return;
  }

  try {
    const response = await fetchComAutenticacao(
      'http://localhost:3000/api/bo',
      {
        method: 'POST',
        body: JSON.stringify(dados)
      }
    );

    if (response && response.ok) {
      const result = await response.json();
      alert(`BO finalizado com sucesso!\nNúmero: ${result.numero}`);
      localStorage.removeItem('boTemp');
      window.location.href = 'consulta.html';
    } else if (response) {
      const error = await response.json();
      alert(`Erro: ${error.error}`);
    }
  } catch (error) {
    console.error('Erro:', error);
    alert('Erro ao finalizar BO');
  }
}

// Listar BOs com token
async function listarBOs() {
  try {
    const response = await fetchComAutenticacao(
      'http://localhost:3000/api/bo'
    );

    if (!response) return;

    const bos = await response.json();
    const lista = document.getElementById('listaBOs');
    lista.innerHTML = '';

    if (bos.length === 0) {
      lista.innerHTML = '<tr><td colspan="4">Nenhum BO encontrado</td></tr>';
      return;
    }

    bos.forEach(bo => {
      const row = document.createElement('tr');
      const data = new Date(bo.data).toLocaleDateString('pt-BR');
      row.innerHTML = `
        <td>${bo.numero}</td>
        <td>${data}</td>
        <td>Concluído</td>
        <td>
          <button onclick="visualizarBO(${bo.id})">Visualizar</button>
          <button onclick="exportarPDF(${bo.id})">PDF</button>
        </td>
      `;
      lista.appendChild(row);
    });
  } catch (error) {
    console.error('Erro:', error);
    alert('Erro ao carregar BOs');
  }
}

// Exportar PDF com autenticação
function exportarPDF(id) {
  if (!authToken) {
    window.location.href = '/index.html';
    return;
  }
  window.location.href = `http://localhost:3000/api/bo/${id}/pdf?token=${authToken}`;
}

// Resto das funções (showTab, adicionarVitima, etc) permanecem igual...
function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
}

function removerBloco(botao) {
  botao.parentElement.remove();
}

function adicionarVitima() {
  const container = document.getElementById('vitimas-list');
  const bloco = document.createElement('div');
  bloco.innerHTML = `
    <input type="text" placeholder="Nome">
    <input type="text" placeholder="RG/CPF/CNH/CNPJ">
    <input type="text" placeholder="Nacionalidade">
    <input type="date" placeholder="Nascimento">
    <input type="number" placeholder="Idade">
    <button type="button" onclick="removerBloco(this)">Excluir Vítima</button>
    <hr>
  `;
  container.appendChild(bloco);
}

function coletarDadosBO() {
  // ... mesmo código anterior
  return {
    vitimas: [],
    suspeitos: [],
    objetos: [],
    relato: document.querySelector('#relato textarea')?.value || '',
    dadosSolicitacao: {},
    dadosOcorrencia: {},
    autoridade: {}
  };
}

function salvarBO() {
  const dados = coletarDadosBO();
  localStorage.setItem('boTemp', JSON.stringify(dados));
  alert('Dados salvos temporariamente');
}

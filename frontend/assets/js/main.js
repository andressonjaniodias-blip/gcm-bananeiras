let authToken = null;

window.addEventListener('DOMContentLoaded', () => {
  authToken = localStorage.getItem('authToken');

  // Inicializa header do dashboard se os elementos existirem
  const elUsuario = document.getElementById('usuarioLogado');
  const elLink = document.getElementById('linkUsuarios');
  if (elUsuario && authToken) {
    try {
      const payload = JSON.parse(atob(authToken.split('.')[1]));
      elUsuario.textContent = payload.usuario;
      if (payload.role === 'admin' && elLink) elLink.style.display = 'inline';
    } catch {}
  }
});

// Login com URL dinâmica
async function login() {
  const usuario = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value;

  if (!usuario || !senha) {
    alert('Usuário e senha são obrigatórios');
    return;
  }

  try {
    console.log('📡 Tentando login em:', API_BASE_URL);
    
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });

    const result = await response.json();

    if (response.ok) {
      authToken = result.token;
      localStorage.setItem('authToken', authToken);
      console.log('✅ Login bem-sucedido!');
      window.location.href = 'pages/dashboard.html';
    } else {
      alert(result.error || 'Erro ao fazer login');
      console.error('❌ Erro:', result);
    }
  } catch (error) {
    console.error('❌ Erro de conexão:', error);
    alert('Erro de conexão. Verifique se o servidor está rodando.\n\n' + 
          'URL tentada: ' + API_BASE_URL);
  }
}

// Logout
function logout() {
  authToken = null;
  localStorage.removeItem('authToken');
  window.location.href = '/index.html';
}

// Fetch com autenticação e URL dinâmica
async function fetchComAutenticacao(endpoint, opcoes = {}) {
  if (!authToken) {
    window.location.href = '/index.html';
    return null;
  }

  const url = `${API_BASE_URL}${endpoint}`;
  console.log('📡 Requisição para:', url);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    ...opcoes.headers
  };

  try {
    const response = await fetch(url, {
      ...opcoes,
      headers
    });

    if (response.status === 401) {
      console.warn('⚠️ Token expirado');
      logout();
      return null;
    }

    return response;
  } catch (error) {
    console.error('❌ Erro na requisição:', error);
    throw error;
  }
}

// Finalizar BO
async function finalizarBO() {
  const dados = coletarDadosBO();

  if (!dados.relato || dados.relato.trim() === '') {
    alert('Relato é obrigatório');
    return;
  }

  if (dados.vitimas.length === 0) {
    alert('Adicione pelo menos uma vítima');
    return;
  }

  try {
    const response = await fetchComAutenticacao('/api/bo', {
      method: 'POST',
      body: JSON.stringify(dados)
    });

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

// Listar BOs
async function listarBOs() {
  try {
    const response = await fetchComAutenticacao('/api/bo');

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
  window.location.href = `${API_BASE_URL}/api/bo/${id}/pdf?token=${authToken}`;
}

// Resto das funções (showTab, adicionarVitima, etc.)
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
    <input type="text" placeholder="Alcunha">
    <input type="text" placeholder="RG/CPF/CNH/CNPJ">
    <input type="text" placeholder="Nacionalidade">
    <input type="date" placeholder="Nascimento">
    <input type="number" placeholder="Idade">
    <input type="text" placeholder="Naturalidade">
    <input type="text" placeholder="Estado Civil">
    <input type="text" placeholder="Ocupação">
    <input type="text" placeholder="Gênero Declarado">
    <input type="text" placeholder="Nome do Pai">
    <input type="text" placeholder="Nome da Mãe">
    <input type="text" placeholder="Rua">
    <input type="text" placeholder="Número">
    <input type="text" placeholder="Cidade">
    <input type="text" placeholder="Complemento">
    <input type="tel" placeholder="Telefone">
    <input type="text" placeholder="Escolaridade">
    <button type="button" onclick="removerBloco(this)">Excluir Vítima</button>
    <hr>
  `;
  container.appendChild(bloco);
}

function adicionarSuspeito() {
  const container = document.getElementById('suspeitos-list');
  const bloco = document.createElement('div');
  bloco.innerHTML = `
    <input type="text" placeholder="Nome">
    <input type="text" placeholder="Alcunha">
    <input type="text" placeholder="RG/CPF/CNH/CNPJ">
    <input type="text" placeholder="Nacionalidade">
    <input type="date" placeholder="Nascimento">
    <input type="number" placeholder="Idade">
    <input type="text" placeholder="Naturalidade">
    <input type="text" placeholder="Estado Civil">
    <input type="text" placeholder="Ocupação">
    <input type="text" placeholder="Gênero Declarado">
    <input type="text" placeholder="Nome do Pai">
    <input type="text" placeholder="Nome da Mãe">
    <input type="text" placeholder="Rua">
    <input type="text" placeholder="Número">
    <input type="text" placeholder="Cidade">
    <input type="text" placeholder="Complemento">
    <input type="tel" placeholder="Telefone">
    <input type="text" placeholder="Escolaridade">
    <button type="button" onclick="removerBloco(this)">Excluir Suspeito</button>
    <hr>
  `;
  container.appendChild(bloco);
}

function adicionarObjeto() {
  const container = document.getElementById('objetos-list');
  const bloco = document.createElement('div');
  bloco.innerHTML = `
    <input type="text" placeholder="Tipo de Objeto">
    <input type="number" placeholder="Quantidade">
    <textarea placeholder="Descrição"></textarea>
    <button type="button" onclick="removerBloco(this)">Excluir Objeto</button>
    <hr>
  `;
  container.appendChild(bloco);
}

function coletarDadosBO() {
  const vitimas = Array.from(document.querySelectorAll('#vitimas-list div')).map(div => {
    const obj = {};
    div.querySelectorAll('input, textarea').forEach(input => {
      if (input.placeholder && input.value) {
        obj[input.placeholder] = input.value;
      }
    });
    return obj;
  });

  const suspeitos = Array.from(document.querySelectorAll('#suspeitos-list div')).map(div => {
    const obj = {};
    div.querySelectorAll('input, textarea').forEach(input => {
      if (input.placeholder && input.value) {
        obj[input.placeholder] = input.value;
      }
    });
    return obj;
  });

  const objetos = Array.from(document.querySelectorAll('#objetos-list div')).map(div => {
    const obj = {};
    div.querySelectorAll('input, textarea').forEach(input => {
      if (input.placeholder && input.value) {
        obj[input.placeholder] = input.value;
      }
    });
    return obj;
  });

  const dadosSolicitacao = {};
  document.querySelectorAll('#solicitacao form input').forEach(input => {
    if (input.placeholder && input.value) {
      dadosSolicitacao[input.placeholder] = input.value;
    }
  });

  const dadosOcorrencia = {};
  document.querySelectorAll('#ocorrencia form input').forEach(input => {
    if (input.placeholder && input.value) {
      dadosOcorrencia[input.placeholder] = input.value;
    }
  });

  const autoridade = {};
  document.querySelectorAll('#autoridade form input').forEach(input => {
    if (input.placeholder && input.value) {
      autoridade[input.placeholder] = input.value;
    }
  });

  return {
    vitimas,
    suspeitos,
    objetos,
    relato: document.querySelector('#relato textarea')?.value || '',
    dadosSolicitacao,
    dadosOcorrencia,
    autoridade
  };
}

function salvarBO() {
  const dados = coletarDadosBO();
  localStorage.setItem('boTemp', JSON.stringify(dados));
  alert('Dados salvos temporariamente');
}

function visualizarBO(id) {
  alert(`Visualizando BO ID: ${id}`);
}

function filtrarBOs() {
  const termo = document.getElementById('buscar')?.value || '';
  const data = document.getElementById('data')?.value || '';
  alert(`Filtro aplicado: termo="${termo}", data="${data}"`);
}
// Login simples
function login() {
  const usuario = document.getElementById('usuario').value;
  const senha = document.getElementById('senha').value;
  if (usuario === "admin" && senha === "1234") {
    window.location.href = "pages/dashboard.html";
  } else {
    alert("Usuário ou senha inválidos!");
  }
}

// Alternar abas
function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
}

// Função para remover bloco dinâmico
function removerBloco(botao) {
  botao.parentElement.remove();
}

// Adicionar Vítima
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

// Adicionar Suspeito
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

// Adicionar Objeto
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

// Coletar dados do formulário (inclui blocos iniciais e adicionados)
function coletarDadosBO() {
  const vitimas = Array.from(document.querySelectorAll('#vitimas-list div')).map(div => {
    const obj = {};
    div.querySelectorAll('input, textarea').forEach(input => {
      obj[input.placeholder] = input.value;
    });
    return obj;
  });

  const suspeitos = Array.from(document.querySelectorAll('#suspeitos-list div')).map(div => {
    const obj = {};
    div.querySelectorAll('input, textarea').forEach(input => {
      obj[input.placeholder] = input.value;
    });
    return obj;
  });

  const objetos = Array.from(document.querySelectorAll('#objetos-list div')).map(div => {
    const obj = {};
    div.querySelectorAll('input, textarea').forEach(input => {
      obj[input.placeholder] = input.value;
    });
    return obj;
  });

  const dadosSolicitacao = {};
  document.querySelectorAll('#solicitacao form input').forEach(input => {
    dadosSolicitacao[input.placeholder] = input.value;
  });

  const dadosOcorrencia = {};
  document.querySelectorAll('#ocorrencia form input').forEach(input => {
    dadosOcorrencia[input.placeholder] = input.value;
  });

  const autoridade = {};
  document.querySelectorAll('#autoridade form input').forEach(input => {
    autoridade[input.placeholder] = input.value;
  });

  return {
    vitimas,
    suspeitos,
    objetos,
    relato: document.querySelector('#relato textarea').value,
    dadosSolicitacao,
    dadosOcorrencia,
    autoridade
  };
}

// Salvar temporário (localStorage)
function salvarBO() {
  const dados = coletarDadosBO();
  localStorage.setItem('boTemp', JSON.stringify(dados));
  alert("Dados salvos temporariamente. Clique em Finalizar para gerar o BO.");
}

// Finalizar BO (envia ao backend e gera número sequencial)
async function finalizarBO() {
  const dados = JSON.parse(localStorage.getItem('boTemp')) || coletarDadosBO();

  try {
    const response = await fetch('http://localhost:3000/api/bo/finalizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    const result = await response.json();
    alert(`BO finalizado com número: ${result.numero}`);
    window.location.href = "consulta.html";
  } catch (error) {
    console.error(error);
    alert("Erro ao finalizar BO.");
  }
}

// Listar BOs
async function listarBOs() {
  try {
    const response = await fetch('http://localhost:3000/api/bo');
    const bos = await response.json();
    const lista = document.getElementById('listaBOs');
    lista.innerHTML = "";

    bos.forEach(bo => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${bo.numero}</td>
        <td>${new Date(bo.data).toLocaleDateString()}</td>
        <td>Concluído</td>
        <td>
          <button onclick="visualizarBO(${bo.id})">Visualizar</button>
          <button onclick="exportarPDF(${bo.id})">PDF</button>
        </td>
      `;
      lista.appendChild(row);
    });
  } catch (error) {
    console.error(error);
    alert("Erro ao carregar BOs.");
  }
}

// Visualizar BO (placeholder)
function visualizarBO(id) {
  alert(`Visualizando BO ID: ${id}`);
}

// Exportar BO para PDF
function exportarPDF(id) {
  window.location.href = `http://localhost:3000/api/bo/${id}/pdf`;
}

// Filtrar BOs (placeholder)
function filtrarBOs() {
  const termo = document.getElementById('buscar')?.value || "";
  const data = document.getElementById('data')?.value || "";
  alert(`Filtro aplicado: termo="${termo}", data="${data}" (em desenvolvimento).`);
}

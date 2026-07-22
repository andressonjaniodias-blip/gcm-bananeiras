// frontend/assets/js/agente.js
// Utilidades compartilhadas de agente:
//   - o padrão de nome exibido no sistema inteiro ("João Carlos, 1234"),
//   - as máscaras de CPF/telefone/CEP e a busca de endereço por CEP,
//   - o formulário da ficha funcional, montado a partir do schema que o backend
//     entrega em GET /api/agentes/ficha/schema (mesma fonte usada pelo PDF).
// Espelha backend/utils/nomeAgente.js e backend/utils/fichaSchema.js.

// ── Nome de exibição ─────────────────────────────────────────────────────────
function nomeCurto(nome) {
  return String(nome || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
}

// "João Carlos, 1234" — usado em listas, seletores, rótulos e documentos.
function nomeExibicaoAgente(a) {
  if (!a) return '';
  const curto = nomeCurto(a.nome_exibicao || a.nome);
  const mat = String(a.matricula || '').trim();
  if (!curto) return mat;
  return mat ? `${curto}, ${mat}` : curto;
}

// ── Máscaras ─────────────────────────────────────────────────────────────────
function mascaraCpf(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 9)      v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  el.value = v;
}

function mascaraTelefone(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10)     v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3');
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,5})/, '($1) $2');
  el.value = v;
}

function mascaraCep(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.replace(/(\d{5})(\d{1,3})/, '$1-$2');
  el.value = v;
}

function aplicarMascara(tipo, el) {
  if (tipo === 'cpf')      mascaraCpf(el);
  if (tipo === 'telefone') mascaraTelefone(el);
  if (tipo === 'cep')      mascaraCep(el);
}

// Sugestão de senha que já passa nas regras do sistema (ver senha.js).
function gerarSenhaForte() {
  const maiusc = 'ABCDEFGHJKLMNPQRSTUVWXYZ', minusc = 'abcdefghijkmnopqrstuvwxyz';
  const nums = '23456789', especiais = '!@#$%&*?';
  const sorteia = alfabeto => alfabeto[Math.floor(Math.random() * alfabeto.length)];
  const base = [sorteia(maiusc), sorteia(nums), sorteia(especiais)];
  const todos = maiusc + minusc + nums + especiais;
  while (base.length < 12) base.push(sorteia(todos));
  return base.sort(() => Math.random() - 0.5).join('');
}

// Sugestão de login a partir do nome completo: primeiro nome em minúsculas, sem
// acento (o comando costuma usar o nome de guerra, mas isso já adianta o campo).
function sugerirUsuario(nomeCompleto) {
  return String(nomeCompleto || '').trim().split(/\s+/)[0]
    ?.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9.]/g, '') || '';
}

// ── Ficha funcional ──────────────────────────────────────────────────────────
const FichaUI = {
  schema: null,

  async carregarSchema() {
    if (this.schema) return this.schema;
    const res = await fetch(`${API_BASE_URL}/api/agentes/ficha/schema`, { credentials: 'include' });
    if (!res.ok) throw new Error('Não foi possível carregar o formulário da ficha.');
    this.schema = await res.json();
    return this.schema;
  },

  /**
   * Desenha os blocos da ficha dentro de `container`.
   *   valores:    { blocoId: { campoId: valor } }
   *   editaveis:  ids dos blocos que este usuário pode gravar (vem da API)
   *   abertos:    ids dos blocos que começam expandidos
   *   somenteLeitura: força tudo como texto (visualização)
   */
  render(container, { valores = {}, editaveis = [], abertos = [], somenteLeitura = false } = {}) {
    if (!this.schema) { container.innerHTML = '<p class="ficha-vazia">Carregando formulário…</p>'; return; }
    // Quem edita os blocos do comando é o comando: guarda isso para o teste de
    // campo isolado (o nome completo, por exemplo, mora num bloco do agente mas
    // só o comando altera).
    this._ehComando = editaveis.includes('funcional');
    container.innerHTML = this.schema.blocos.map(b => {
      const podeEditar = !somenteLeitura && editaveis.includes(b.id);
      const vals = valores[b.id] || {};
      return `
        <details class="ficha-bloco" data-bloco="${b.id}"${abertos.includes(b.id) ? ' open' : ''}>
          <summary>
            <span class="ficha-bloco-titulo">${b.icone || ''} ${b.titulo}</span>
            ${podeEditar ? '' : '<span class="ficha-tag">somente leitura</span>'}
            ${b.sensivel ? '<span class="ficha-tag ficha-tag-sensivel">dado sensível</span>' : ''}
          </summary>
          <div class="ficha-bloco-corpo">
            ${b.aviso ? `<p class="ficha-aviso">${b.aviso}</p>` : ''}
            <div class="ficha-campos">
              ${b.campos.map(c => this._campoHTML(b, c, vals[c.id], podeEditar)).join('')}
            </div>
          </div>
        </details>`;
    }).join('');

    container.querySelectorAll('[data-mascara]').forEach(el => {
      el.addEventListener('input', () => aplicarMascara(el.dataset.mascara, el));
    });
    container.querySelectorAll('[data-acao="add-linha"]').forEach(btn => {
      btn.addEventListener('click', () => this._addLinha(btn));
    });
    container.querySelectorAll('[data-campo="cep"]').forEach(el => {
      el.addEventListener('blur', () => this._buscarCep(el));
    });
    this._ligarRemocoes(container);
  },

  _campoHTML(b, campo, valor, podeEditar) {
    const editavel = podeEditar && (campo.dono !== 'comando' || this._ehComando);
    if (campo.tipo === 'lista') return this._listaHTML(b, campo, valor, editavel);

    const largura = campo.largura === 2 ? ' ficha-campo-largo' : '';
    const attrs = `data-bloco="${b.id}" data-campo="${campo.id}"`;
    const v = valor == null ? '' : String(valor);
    let controle;

    if (!editavel) {
      controle = `<span class="ficha-valor${v ? '' : ' vazio'}" ${attrs}>${this._rotuloValor(campo, v) || 'Não informado'}</span>`;
    } else if (campo.tipo === 'textarea') {
      controle = `<textarea ${attrs} rows="2" maxlength="${campo.max || 1000}" placeholder="${campo.placeholder || ''}">${this._esc(v)}</textarea>`;
    } else if (campo.tipo === 'select') {
      controle = `<select ${attrs}>${this._opcoesHTML(campo, v)}</select>`;
    } else {
      const tipo = campo.tipo === 'data' ? 'date' : 'text';
      controle = `<input type="${tipo}" ${attrs} value="${this._esc(campo.tipo === 'data' ? v.slice(0, 10) : v)}"
        maxlength="${campo.max || 150}" placeholder="${campo.placeholder || ''}"
        ${campo.mascara ? `data-mascara="${campo.mascara}"` : ''}>`;
    }

    return `<div class="ficha-campo${largura}">
      <label>${campo.rotulo}${campo.obrigatorio ? ' <span class="obrig">*</span>' : ''}</label>
      ${controle}
      ${campo.ajuda ? `<small class="ficha-ajuda">${campo.ajuda}</small>` : ''}
    </div>`;
  },

  _opcoesHTML(campo, valor) {
    const opcoes = Array.isArray(campo.opcoes) ? campo.opcoes : [];
    const itens = opcoes.map(o => (typeof o === 'object' ? o : { valor: o, rotulo: o }));
    // Valor legado fora da lista (ex.: cargo anterior à padronização) vira opção
    // extra, para a edição não apagar em silêncio o que estava gravado.
    if (valor && !itens.some(o => o.valor === valor)) itens.unshift({ valor, rotulo: `${valor} (fora da lista)` });
    return `<option value="">— selecione —</option>` +
      itens.map(o => `<option value="${this._esc(o.valor)}"${o.valor === valor ? ' selected' : ''}>${this._esc(o.rotulo)}</option>`).join('');
  },

  _listaHTML(b, campo, valor, editavel) {
    const linhas = Array.isArray(valor) ? valor : [];
    const corpo = linhas.length
      ? linhas.map(l => this._linhaHTML(b, campo, l, editavel)).join('')
      : (editavel ? '' : '<p class="ficha-vazia">Nada registrado.</p>');
    // --ficha-cols dimensiona a grade da lista conforme o nº de colunas do schema.
    return `<div class="ficha-campo ficha-campo-largo ficha-lista" data-lista="${campo.id}" data-bloco="${b.id}"
         style="--ficha-cols:${campo.colunas.length}">
      <label>${campo.rotulo}</label>
      ${campo.ajuda ? `<small class="ficha-ajuda">${campo.ajuda}</small>` : ''}
      <div class="ficha-lista-head">${campo.colunas.map(c => `<span>${c.rotulo}</span>`).join('')}${editavel ? '<span></span>' : ''}</div>
      <div class="ficha-lista-corpo">${corpo}</div>
      ${editavel ? `<button type="button" class="ficha-add" data-acao="add-linha"
          data-bloco="${b.id}" data-lista="${campo.id}">+ Adicionar linha</button>` : ''}
    </div>`;
  },

  _linhaHTML(b, campo, linha = {}, editavel) {
    const celulas = campo.colunas.map(col => {
      const v = linha[col.id] == null ? '' : String(linha[col.id]);
      if (!editavel) return `<span class="ficha-valor">${this._rotuloValor(col, v) || '—'}</span>`;
      if (col.tipo === 'select') return `<select data-col="${col.id}">${this._opcoesHTML(col, v)}</select>`;
      const tipo = col.tipo === 'data' ? 'date' : 'text';
      return `<input type="${tipo}" data-col="${col.id}" value="${this._esc(tipo === 'date' ? v.slice(0, 10) : v)}" maxlength="300">`;
    }).join('');
    return `<div class="ficha-lista-linha">${celulas}${editavel ? '<button type="button" class="ficha-remove" data-acao="remove-linha" title="Remover">✕</button>' : ''}</div>`;
  },

  _addLinha(btn) {
    const { bloco: blocoId, lista } = btn.dataset;
    const b = this.schema.blocos.find(x => x.id === blocoId);
    const campo = b.campos.find(c => c.id === lista);
    const corpo = btn.closest('.ficha-lista').querySelector('.ficha-lista-corpo');
    corpo.querySelector('.ficha-vazia')?.remove();
    corpo.insertAdjacentHTML('beforeend', this._linhaHTML(b, campo, {}, true));
    this._ligarRemocoes(corpo);
  },

  _ligarRemocoes(escopo) {
    escopo.querySelectorAll('[data-acao="remove-linha"]').forEach(btn => {
      btn.onclick = () => btn.closest('.ficha-lista-linha').remove();
    });
  },

  async _buscarCep(el) {
    const v = el.value.replace(/\D/g, '');
    if (v.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${v}/json/`);
      const data = await res.json();
      if (data.erro) return;
      const raiz = el.closest('.ficha-bloco') || document;
      const set = (campo, val) => {
        const alvo = raiz.querySelector(`[data-campo="${campo}"]`);
        if (alvo && !alvo.value && val) alvo.value = val;
      };
      set('logradouro', data.logradouro);
      set('bairro',     data.bairro);
      set('cidade',     data.localidade);
      set('uf',         data.uf);
    } catch {}
  },

  /** Lê os blocos editáveis do formulário: { blocoId: { campoId: valor } }. */
  coletar(container, editaveis = []) {
    const out = {};
    this.schema.blocos.forEach(b => {
      if (!editaveis.includes(b.id)) return;
      const raiz = container.querySelector(`.ficha-bloco[data-bloco="${b.id}"]`);
      if (!raiz) return;
      const dados = {};
      b.campos.forEach(campo => {
        if (campo.tipo === 'lista') {
          const linhas = [...raiz.querySelectorAll(`.ficha-lista[data-lista="${campo.id}"] .ficha-lista-linha`)];
          dados[campo.id] = linhas.map(linha => {
            const item = {};
            campo.colunas.forEach(col => {
              const el = linha.querySelector(`[data-col="${col.id}"]`);
              if (el && el.value.trim()) item[col.id] = el.value.trim();
            });
            return item;
          }).filter(item => Object.keys(item).length);
          return;
        }
        const el = raiz.querySelector(`[data-campo="${campo.id}"]`);
        if (el && 'value' in el) dados[campo.id] = el.value.trim();
      });
      out[b.id] = dados;
    });
    return out;
  },

  _rotuloValor(campo, valor) {
    if (!valor) return '';
    if (campo.tipo === 'data') {
      const s = String(valor).slice(0, 10);
      const [y, m, d] = s.split('-');
      return d ? `${d}/${m}/${y}` : s;
    }
    if (campo.tipo === 'select') {
      const achado = (campo.opcoes || []).map(o => (typeof o === 'object' ? o : { valor: o, rotulo: o }))
        .find(o => o.valor === valor);
      return achado ? achado.rotulo : valor;
    }
    return valor;
  },

  _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
};

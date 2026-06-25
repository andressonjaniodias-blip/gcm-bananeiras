// Geolocalização reversa com Nominatim (OpenStreetMap) — sem chave de API
// Rate limit: 1 req/s por IP — adequado para uso pontual por agente

async function _geoReverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=pt-BR`;
  const res = await fetch(url, { headers: { 'User-Agent': 'GCM-Bananeiras/1.0' } });
  if (!res.ok) throw new Error('Geocodificação falhou');
  return res.json();
}

function _geoResolver(ref) {
  if (!ref) return null;
  if (typeof ref !== 'string') return ref;
  return document.getElementById(ref) || document.querySelector(ref);
}

function _geoBtnLoading(btn, on) {
  if (!btn) return;
  if (on) {
    btn.dataset.geoOrig = btn.innerHTML;
    btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;">'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"'
      + ' style="animation:geo-spin 0.9s linear infinite">'
      + '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83'
      + 'M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>'
      + 'Buscando...</span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.geoOrig || btn.innerHTML;
    btn.disabled = false;
  }
}

function _geoToast(msg, tipo) {
  if      (typeof showToast      === 'function') showToast(msg, tipo);
  else if (typeof mostrarMsgViat === 'function') mostrarMsgViat(msg, tipo);
  else if (typeof mostrarMsg     === 'function') mostrarMsg(msg, tipo);
  else if (typeof toast          === 'function')
    toast(msg, tipo === 'success' ? 'ok' : tipo === 'danger' ? 'erro' : tipo);
}

/**
 * Solicita a localização atual e preenche campos do formulário.
 *
 * Para endereço completo:
 *   usarLocalizacaoAtual({
 *     tipo: 'endereco',
 *     campos: { logradouro: 'idOuSeletor', numero: '...', bairro: '...', cidade: '...', uf: '...', cep: '...' },
 *     btn: elementoBotao
 *   })
 *
 * Para campo único de texto livre:
 *   usarLocalizacaoAtual({ tipo: 'local', campo: 'idOuSeletor', btn: elementoBotao })
 *
 * Chaves válidas para `campos`:
 *   logradouro, logradouroNumero (rua + nº combinados), numero,
 *   bairro, complemento (recebe o bairro), cidade, uf, cep
 */
async function usarLocalizacaoAtual({ tipo = 'local', campos = {}, campo, btn } = {}) {
  if (!navigator.geolocation) {
    _geoToast('Geolocalização não suportada neste dispositivo.', 'warning');
    return;
  }
  _geoBtnLoading(btn, true);
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 10000, maximumAge: 30000
      })
    );
    const data = await _geoReverseGeocode(pos.coords.latitude, pos.coords.longitude);
    const addr = data.address || {};

    const rua    = addr.road || addr.pedestrian || addr.footway || addr.path || '';
    const num    = addr.house_number || '';
    const bairro = addr.suburb || addr.neighbourhood || addr.quarter || '';
    const cidade = addr.city || addr.town || addr.village || addr.municipality || '';
    const uf     = addr.state_code || '';
    const cep    = (addr.postcode || '').replace(/(\d{5})(\d{3})/, '$1-$2');

    if (tipo === 'endereco') {
      const mapa = {
        logradouro:       rua,
        logradouroNumero: [rua, num ? `Nº ${num}` : ''].filter(Boolean).join(', '),
        numero:           num,
        bairro,
        complemento:      bairro,
        cidade,
        uf,
        cep,
      };
      let algum = false;
      Object.entries(campos).forEach(([chave, ref]) => {
        const el = _geoResolver(ref);
        if (!el || !mapa[chave]) return;
        el.value = mapa[chave];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        algum = true;
      });
      if (algum) _geoToast('Localização preenchida. Verifique os dados antes de salvar.', 'success');
      else       _geoToast('Localização obtida, mas nenhum campo pôde ser preenchido.', 'warning');
    } else {
      const el = _geoResolver(campo);
      if (el) {
        el.value = [rua, num ? `Nº ${num}` : '', bairro, cidade].filter(Boolean).join(', ');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        _geoToast('Localização preenchida. Verifique os dados antes de salvar.', 'success');
      }
    }
  } catch (err) {
    const msg =
      err.code === 1 ? 'Permissão de localização negada. Habilite nas configurações do navegador.' :
      err.code === 2 ? 'Localização indisponível no momento. Tente novamente.' :
      err.code === 3 ? 'Tempo esgotado ao obter localização.' :
                       'Erro ao obter localização.';
    _geoToast(msg, 'danger');
  } finally {
    _geoBtnLoading(btn, false);
  }
}

// Conveniência para blocos dinâmicos de vítima/suspeito (gerados por htmlPessoa em main.js)
function usarLocalizacaoPessoa(btn) {
  const bloco = btn.closest('.bloco-pessoa');
  if (!bloco) return;
  usarLocalizacaoAtual({
    tipo: 'endereco',
    campos: {
      logradouroNumero: bloco.querySelector('[name="endereco"]'),
      bairro:           bloco.querySelector('[name="bairro"]'),
      cidade:           bloco.querySelector('[name="cidade"]'),
    },
    btn,
  });
}

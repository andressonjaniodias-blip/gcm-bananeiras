class Boletim {
  constructor({
    numero,
    dadosSolicitacao,
    dadosOcorrencia,
    vitimas = [],
    suspeitos = [],
    testemunhas = [],
    relato,
    objetos = [],
    autoridade,
    data
  }) {
    this.numero = numero;
    this.dadosSolicitacao = dadosSolicitacao;
    this.dadosOcorrencia = dadosOcorrencia;
    this.vitimas = vitimas;
    this.suspeitos = suspeitos;
    this.testemunhas = testemunhas;
    this.relato = relato;
    this.objetos = objetos;
    this.autoridade = autoridade;
    this.data = data;
  }
}
module.exports = Boletim;

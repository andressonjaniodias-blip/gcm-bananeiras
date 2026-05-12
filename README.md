# GCM Bananeiras - API de Registro de BO

API Express.js para o Sistema de Registro de Boletim de Ocorrência (BO).

## 🚀 Instalação

### Pré-requisitos
- Node.js 18.x ou superior
- npm

### Setup Local

1. Clone o repositório:
```bash
git clone https://github.com/andressonjaniodias-blip/gcm-bananeiras.git
cd gcm-bananeiras
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor:
```bash
npm start
```

O servidor estará rodando em `http://localhost:3000`

## 📝 Scripts Disponíveis

- `npm start` - Inicia o servidor em produção
- `npm run dev` - Inicia o servidor com nodemon (desenvolvimento)

## 🔧 Tecnologias

- **Express.js** - Framework web
- **CORS** - Controle de requisições cross-origin
- **Body Parser** - Parser de requisições JSON

## 📡 Endpoints

- `GET /` - Status da API
- `GET/POST /api/bo` - Rotas de BO (veja `routes/boRoutes.js`)

## 🌐 Deploy no Render

1. Acesse [render.com](https://render.com)
2. Clique em **New +** → **Web Service**
3. Selecione este repositório
4. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Clique em **Deploy**

## 📄 Licença

MIT

## 👤 Autor

andressonjaniodias-blip

# 👻 Ghostflix

Seu próprio "streaming" de filmes em casa. O Ghostflix observa a pasta `Filmes`, busca a capa e a sinopse de cada
filme na internet e mostra tudo numa interface escura, feita para computador e celular. Toca qualquer formato
(convertendo com o ffmpeg quando o navegador não suporta), com escolha de áudio e legenda, e pode ser
compartilhado pela internet com um link.

- Catálogo atualizado em tempo real: coloque um vídeo na pasta e ele aparece na tela, sem recarregar.
- Capas padronizadas (IMDb, Wikipédia ou TMDB), busca sem acentos, filtros por década e formato.
- Player próprio: todas as faixas de áudio e legendas, tela cheia, atalhos de teclado.
- "Continuar de onde parou" separado para cada pessoa, sem login.
- Melhoria automática de imagem para filmes abaixo de Full HD.
- Link público com troca automática entre ngrok e Cloudflare, sem interromper quem está assistindo.

## Requisitos

| Programa | Para quê | Instalação (Windows) |
|---|---|---|
| **Node.js 20+** | Rodar o Ghostflix | https://nodejs.org ou `winget install OpenJS.NodeJS.LTS` |
| **ffmpeg** (recomendado) | Tocar MKV/AVI/HEVC, áudio e legendas, melhoria de imagem | `winget install Gyan.FFmpeg` |
| ngrok (opcional) | Link público | `winget install ngrok.ngrok` |
| cloudflared (opcional) | Link público sem cota mensal | `winget install Cloudflare.cloudflared` |

Sem o ffmpeg, o Ghostflix funciona só com arquivos que o navegador já toca sozinho (MP4/WebM).

## Como executar

```bash
git clone https://github.com/<seu-usuario>/ghostflix.git
cd ghostflix
npm install
npm start
```

1. Coloque seus filmes na pasta `Filmes/` (ela vem vazia; subpastas também valem).
2. Abra **http://localhost:3000**.
3. No celular, na mesma rede Wi-Fi, use o endereço `Rede: http://192.168…:3000` que aparece no terminal.
   Dá para "Adicionar à tela inicial" e usar como app.

No Windows, dá para iniciar com dois cliques em `Iniciar Ghostflix.bat`.
Para fechar, aperte **Ctrl+C** no terminal (assim a conversão e a melhoria de imagem em andamento também são encerradas).

O `npm start` gera a interface (React) automaticamente na primeira vez e sempre que algo em `client/` mudar.

## Opções do `npm start`

As flags vão depois de `--`:

| Comando | O que faz |
|---|---|
| `npm start` | Só na sua rede (computador e celulares do Wi-Fi) |
| `npm start -- --tunnel` | Cria **dois links públicos** (ngrok + Cloudflare) com troca automática |
| `npm start -- --ngrok` | Link público só pelo ngrok |
| `npm start -- --cloudflare` | Link público só pelo Cloudflare |
| `npm start -- --no-enhance` | Não faz a melhoria automática de imagem |

As flags podem ser combinadas, ex.: `npm start -- --tunnel --no-enhance`.

### Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
| `MOVIES_DIR` | `./Filmes` | Usar outra pasta de filmes (ex.: um HD externo) |
| `DATA_DIR` | `./data` | Onde ficam capas, cache e versões melhoradas |
| `TMDB_API_KEY` | — | Chave grátis do TMDB: capas e sinopses em português, com prioridade |
| `POLLING=1` | — | Para pastas em rede/NAS onde a detecção normal não funciona |
| `ENHANCE=0` | — | Mesmo que `--no-enhance` |
| `ENHANCE_CRF` | `19` | Qualidade da melhoria (menor = melhor e arquivo maior) |
| `ENHANCE_PRESET` | `medium` | Velocidade da melhoria (`fast` é mais rápido, um pouco pior) |
| `VIDEO_ENCODER` | automático | Força o encoder da conversão ao vivo (`libx264`, `h264_nvenc`, `h264_qsv`, `h264_amf`) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe` | Caminho do ffmpeg, se não estiver no PATH |
| `NGROK_DOMAIN` | — | Domínio fixo grátis do ngrok (`https://seu-dominio.ngrok-free.app`) |
| `NGROK_PATH` / `CLOUDFLARED_PATH` | — | Caminho dos programas, se não estiverem no PATH |
| `PUBLIC_URLS` | — | Endereços próprios extras na troca automática (ex.: `https://meu-dominio.com`) |

Exemplo no PowerShell:

```powershell
$env:MOVIES_DIR = 'E:\Filmes'; $env:PORT = '8080'; npm start -- --tunnel
```

## Compartilhar pela internet

```bash
npm start -- --tunnel
```

Abre **dois links ao mesmo tempo**, um pelo ngrok e outro pelo Cloudflare. O terminal mostra os dois e marca com 🌐 o
que está funcionando, que é o que você envia. Se um deles cair no meio de um filme (por exemplo, a cota mensal do
ngrok grátis acabou, erro `ERR_NGROK_725`), quem está assistindo passa sozinho para o outro, sem parar o vídeo nem
recarregar a página. O Ghostflix verifica os links a cada 30 s e avisa no terminal quando um cai ou volta.

- **ngrok**: uma vez só, dê dois cliques em `Configurar ngrok.bat` e cole o seu Authtoken
  (https://dashboard.ngrok.com/get-started/your-authtoken). No primeiro acesso, a pessoa vê um aviso do ngrok e
  clica em "Visit Site". O plano grátis tem uma cota mensal de tráfego.
- **Cloudflare**: não precisa de conta nem tem cota mensal. O endereço (`https://….trycloudflare.com`) muda toda vez
  que o Ghostflix inicia. Por esse link, a lista de filmes se atualiza a cada 10 s em vez de na hora.
- Os links são **públicos e sem senha**: quem tiver o link pode assistir e baixar os filmes.
- Compartilhe apenas conteúdo que você tem direito de distribuir.

## Como usar

- **Busca e filtros**: a busca ignora acentos; ordene por data, nome, ano ou tamanho e filtre por década ou formato.
  Atalho **/** vai para a busca.
- **Capa errada?** Abra o filme → "Capa errada? Corrigir título", ajuste o nome/ano e busque de novo.
- **Títulos**: o nome e o ano vêm do nome do arquivo (`The.Matrix.1999.1080p.BluRay.mkv` → "The Matrix", 1999).
- **Continuar de onde parou**: o card mostra uma barrinha do quanto já foi visto, e nos detalhes aparecem
  "Continuar" e "Do início". Cada pessoa tem o próprio progresso, guardado no navegador dela. Ao chegar nos
  créditos, o filme conta como assistido. O progresso não passa de um aparelho para outro.
- **Baixar**: o botão "Baixar" envia o arquivo original.

### Player

| Tecla | Ação |
|---|---|
| Espaço ou K | Play / pause |
| ← / → | Voltar / avançar 10 s |
| ↑ / ↓ | Volume |
| F (ou duplo clique) | Tela cheia |
| M | Mudo |
| C | Menu de áudio e legendas |

- **Áudio e legendas**: o botão de legenda (ou a tecla C) mostra todas as faixas do arquivo. A escolha de idioma
  e o tamanho da legenda são lembrados para os próximos filmes.
- **Legendas externas**: coloque o arquivo ao lado do vídeo com o mesmo nome, ex.: `Filme (2009).srt`,
  `Filme (2009).pt-BR.srt`, `Filme (2009).eng.srt`. Legendas em Windows-1252 são convertidas automaticamente.
  Legendas em formato de imagem (PGS/VobSub) aparecem na lista mas não são suportadas.
- **Formatos**: MP4/WebM compatíveis tocam direto. Os demais (AVI, MKV, WMV, HEVC…) são convertidos ao vivo para
  HLS e funcionam também no iPhone e no Android. Vídeos H.264 só são reempacotados, quase sem uso de CPU.
- **Tela cheia**: ocupa o monitor todo; no celular gira para paisagem; no iPhone usa o player do próprio aparelho.

## Melhoria automática de imagem

Todo filme abaixo de Full HD (menos de 1920 de largura e menos de 1080 de altura) é melhorado sozinho, em segundo
plano, um por vez: remove ruído e blocos de compressão, aumenta para até 1920×1080 e realça a nitidez.
Filmes Full HD ou 4K ficam como estão.

- O arquivo original não é alterado. A versão melhorada fica em `data/enhanced/` e o player passa a usá-la assim
  que fica pronta (selo **HD+** na capa). O progresso aparece nos detalhes do filme.
- Leva mais ou menos metade da duração do filme e ocupa uns 3 a 5 GB por filme. Roda com prioridade baixa.
- É feita em blocos de 5 minutos: se o Ghostflix fechar no meio, continua do último bloco pronto.
- Ao remover um filme da pasta, a versão melhorada também é apagada.
- Desative com `npm start -- --no-enhance`.

## Desenvolvimento

```bash
npm run dev     # servidor com reinício automático + interface com atualização instantânea
```

Abra http://localhost:5173 (o Vite repassa a API para o servidor na porta 3000).
`npm run build` gera a interface de produção em `client/dist`.

### Arquitetura (MVC)

```
server/                      Backend (Node.js + Express)
├── index.js                 Ponto de entrada: liga tudo e sobe o servidor
├── config.js                Variáveis de ambiente e flags
├── app.js                   Express: CORS, rotas, capas e a interface React compilada
├── routes/index.js          Endereços da API → controllers
├── models/Library.js        Model: a biblioteca de filmes (data/library.json)
├── controllers/             Controllers: respondem às requisições
│   ├── moviesController.js      lista, correção de título, streaming e download
│   ├── playbackController.js    faixas, legendas, conversão HLS
│   └── systemController.js      tempo real (SSE), ping e links públicos
├── services/                Regras e integrações usadas pelos controllers
│   ├── watcher.js               observa a pasta Filmes
│   ├── covers.js, coverQueue.js busca e padronização de capas
│   ├── media.js                 ffprobe/ffmpeg: análise, legendas e sessões HLS
│   ├── enhance.js, enhanceQueue.js  melhoria de imagem em blocos
│   ├── tunnel.js, links.js      ngrok, Cloudflare e verificação dos links
│   ├── events.js                Server-Sent Events
│   └── titles.js                título e ano a partir do nome do arquivo
└── utils/fs.js

client/                      Frontend (React + Vite)
├── index.html
├── public/                  ícone e manifest (PWA)
└── src/
    ├── main.jsx
    ├── models/              Dados e regras: API com troca de link, filmes, progresso, preferências, legendas
    ├── controllers/         Estado e lógica: LibraryController, PlayerController, ToastController
    └── views/               Componentes React: TopBar, Hero, Toolbar, MovieGrid, MovieCard,
                             DetailsDialog, Toasts, player/ (PlayerView, SeekBar, TracksMenu)
```

As views só desenham o estado dos controllers e repassam as ações a eles; os controllers usam os models para
falar com o servidor e guardar dados no navegador.

### Pastas que não vão para o repositório

- `Filmes/`: seus vídeos (a pasta vem vazia; cada um coloca os seus).
- `data/`: capas, cache, conversões e versões melhoradas, gerados automaticamente.
- `node_modules/` e `client/dist/`: recriados por `npm install` e `npm start`.

# 🤸 MexeKids — jogue com o corpo

Jogo web infantil: fique de frente para a câmera no gol fixo, seu **boneco 3D** copia seus movimentos e você defende bolas aleatórias com **hitboxes 3D** (luvas, cabeça, peito).

**Visão por trás do goleiro:** a câmera 3D fica dentro do gol, você vê as costas do boneco e a bola nasce pequena no campo e cresce vindo na sua cara. Sem espelho — sua direita é a direita dele.

## Stack (conforme escolhido)
- Vanilla JS + Three.js (Canvas 3D) + Vite
- `@mediapipe/tasks-vision` moderno (PoseLandmarker lite, GPU)
- WebAudio sintetizado (sem assets) + SpeechSynthesis pt-BR

## Como rodar

### Opção A — Windows (mais fácil, Node já instalado)
```powershell
# copiar projeto pra pasta local (UNC \\wsl$ trava o esbuild)
Copy-Item -Path "\\wsl.localhost\Ubuntu\home\klecio\pessoal\projetos\meus\MovoKids\*" -Destination "C:\MovoKids" -Recurse -Force
cd C:\MovoKids
npm install
npm run dev
# abra https://localhost:5173 ou http://localhost:5173 e PERMITA a câmera
```

### Opção B — dentro do WSL (instalar Node primeiro)
```bash
cd ~/pessoal/projetos/meus/MovoKids
# instalar node 20 via nvm ou apt, depois:
npm install
npm run dev
```

> Câmera exige **HTTPS ou localhost**. Por isso o projeto já vem com HTTPS
> autoassinado (`@vitejs/plugin-basic-ssl`).

## Jogar em outro PC/notebook na mesma rede (Wi-Fi)

No **PC principal** (rode a partir de pasta local do Windows, ex: `C:\MovoKids`):

```powershell
npm install
npm run rede
# vai mostrar algo como: Network: https://192.168.18.7:5173/
```

Descobrir o IP (se precisar): `ipconfig` → procure `Endereço IPv4` do Wi-Fi.

No **notebook** (mesmo Wi-Fi), no Chrome:
1. Acesse `https://SEU-IP:5173` (ex: `https://192.168.18.7:5173`)
2. Vai aparecer "Sua conexão não é particular" → **Avançado** → **Prosseguir**
   (normal: é o certificado local do projeto)
3. **Permita a câmera** quando o jogo pedir. Pronto! 🧤

Se o notebook não conectar: libere a porta no firewall do PC principal
(PowerShell como admin):
```powershell
New-NetFirewallRule -DisplayName "MovoKids Vite" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
```

## Jogar sem câmera (teste)
Se a câmera for negada, o **mouse move as luvas** automaticamente — dá pra testar colisão, placar e sons.

## Estrutura da base (engine — reaproveitada por todos os jogos)
- `src/engine/input.js` — **InputManager**: câmera persistente + pose + mãos + gestos num `nextFrame()` por frame; `holdProgress()` pro joinha
- `src/engine/screens.js` — router de telas (`menu/calib/game/over`)
- `src/engine/storage.js` — recordes e ajustes (localStorage)
- `src/engine/audio.js` — sons sintetizados + voz pt-BR
- `src/games/registry.js` — **adicionar jogo = 1 linha aqui** (+ contrato em `src/games/_template.js`)
- `src/main.js` — hub fino: cards de jogos → calibragem → jogo → fim
- `src/camera/camera.js` — getUserMedia + `isLive()`
- `src/vision/mediapipe.js` — PoseLandmarker (~50fps) + HandLandmarker (~8fps)
- `src/vision/gestures.js` — `isThumbsUp()` puro (testável em Node)
- `src/vision/tracking.js` — smoothing adaptativo, `mapJointsToGoal()`, `checkFraming()`, esqueletinho 2D PiP
- `src/game/stadium.js` — campo + **gol fixo** 7.32x2.44 + rede + arquibancada
- `src/game/avatar3d.js` — **boneco 3D** marionete + `getHitboxes()` (luvas r=0.52, peito, cabeça...)
- `src/game/ball.js` — bola 3D com curva e velocidade por nível
- `src/game/particles3d.js` — confete
- `src/game/goalkeeper.js` — loop, colisão hitbox x bola, placar, níveis
- `src/audio/sounds.js` — sons + voz
- `src/main.js` — telas menu → calibragem → jogo → fim

## Jogos (hub — adicionar = 1 arquivo + 1 linha no registry)
- 🧤 **Goleiro Mágico 3D** — defenda bolas no gol fixo (hitboxes nas luvas).
- 🧍 **Estátua Mágica** — dance com a música; quando parar, imite o fantasma dourado e congele 3s (similaridade de pose normalizada).
- 🥊 **Soco Maluco** — soque o robô (luva rápida perto do peito) e bloqueie as estrelas de energia. HP, combo, KO e níveis.
- 🎯 **Mira Maluca** — galeria de tiro com as DUAS luvas (mira dupla, tiro alternado): linha de mira + marca de impacto na parede, bolhas automáticas, pinça 👌 pro canhão de confete (na mão que pinçou), ✌️ troca de arma. Balão dourado bônus, 60s contra o relógio.

## Regras
- 👍 segurado por ~1s inicia o jogo (calibragem) e rejoga sozinho (tela de fim).
- Câmera abre uma vez e é reusada entre partidas (sem tela preta ao rejogar).
- Latência mínima: detecção colada no render (loop único), luvas seguem quase direto.
- 3 gols sofridos = fim. Recorde em `localStorage`.
- Nível = 1 + floor(defesas/3). Nível 4+ = 2 bolas simultâneas.
- Calibragem exige ombros + quadris + punhos visíveis, centralizado.

## Próximos (mesma base)
1. Pegando Estrelas, 2. Estátua Mágica, 3. Desenho no Ar (ligar HandLandmarker).

// Registro de jogos — adicionar um jogo novo = 1 entrada aqui + 1 arquivo.
// Cada jogo implementa: create(canvas, events) => { start, stop, dispose,
// setJointsProvider(fn), setFrameHook(fn) }  (ver games/_template.js)
import { GoalkeeperGame } from '../game/goalkeeper.js';
import { StatueGame } from './statue.js';
import { FightGame } from './fight.js';
import { ShooterGame } from './shooter.js';

export const GAMES = [
  {
    id: 'goalkeeper',
    emoji: '🧤',
    title: 'Goleiro Mágico 3D',
    desc: 'Você É o goleiro! Defenda as bolas com luvas, cabeça e corpo.',
    icons: ['🧤', '⚽', '🔥'],
    goalsMax: '/3',
    create: (canvas, events) => new GoalkeeperGame(canvas, events)
  },
  {
    id: 'statue',
    emoji: '🧍',
    title: 'Estátua Mágica',
    desc: 'Dance! Quando a música parar, congele como estátua! ❄️',
    icons: ['⭐', '😅', '🗿'],
    goalsMax: '/5',
    create: (canvas, events) => new StatueGame(canvas, events)
  },
  {
    id: 'shooter',
    emoji: '🎯',
    title: 'Mira Maluca',
    desc: 'Mire com as DUAS luvas! Bolhas automáticas, pinça 👌 pro canhão, ✌️ troca de arma!',
    icons: ['🎯', '⏱️', '🔫'],
    goalsMax: 's',
    wantsHands: true, // mira e gatilhos vêm das mãos
    create: (canvas, events) => new ShooterGame(canvas, events)
  },
  {
    id: 'fight',
    emoji: '🥊',
    title: 'Soco Maluco',
    desc: 'Soque o robô rapidinho e bloqueie as estrelas de energia!',
    icons: ['🥊', '💔', '🔥'],
    goalsMax: '/3',
    create: (canvas, events) => new FightGame(canvas, events)
  }
];

export function getGame(id) {
  return GAMES.find(g => g.id === id) || null;
}

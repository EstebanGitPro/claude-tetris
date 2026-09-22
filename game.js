'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const THEME_STORAGE_KEY = 'tetris-theme';

const THEMES = {
  dark: {
    pieceColors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#90caf9', // J - pale blue
      '#ffb74d', // L - orange
      '#f06292', // N - magenta
    ],
    gridColor: '#22222e',
    blockHighlight: 'rgba(255, 255, 255, 0.12)',
  },
  light: {
    // Tonos más saturados/oscuros para contrastar bien sobre el tablero claro.
    pieceColors: [
      null,
      '#0288d1', // I - cyan
      '#f9a825', // O - yellow
      '#8e24aa', // T - purple
      '#2e7d32', // S - green
      '#d32f2f', // Z - red
      '#1565c0', // J - blue
      '#ef6c00', // L - orange
      '#c2185b', // N - magenta
    ],
    gridColor: '#d5d5e2',
    blockHighlight: 'rgba(0, 0, 0, 0.18)',
  },
};

let currentTheme = 'dark';
let COLORS = THEMES.dark.pieceColors;
let gridColor = THEMES.dark.gridColor;
let blockHighlight = THEMES.dark.blockHighlight;

// Visual skins. `palette` (9 entries, aligned with PIECES) and `gridColor`
// override the theme when set; null means "follow the light/dark theme".
// Each draw(context, px, py, size, color) paints one block at pixel coords;
// globalAlpha is already set by drawBlock (ghost uses 0.2).
const SKIN_STORAGE_KEY = 'tetris-skin';

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = {
  retro: {
    palette: null,
    gridColor: null,
    draw(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.fillStyle = blockHighlight;
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    palette: [
      null,
      '#00f0ff', // I
      '#fff200', // O
      '#d000ff', // T
      '#39ff14', // S
      '#ff073a', // Z
      '#1f6bff', // J
      '#ff8c00', // L
      '#ff00c8', // N
    ],
    gridColor: '#101018',
    draw(context, px, py, size, color) {
      const isGhost = context.globalAlpha < 1;
      context.save();
      // Dim translucent core
      context.globalAlpha *= 0.3;
      context.fillStyle = color;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      context.restore();
      // Glowing outline (no glow for the ghost so it stays subtle)
      context.save();
      if (!isGhost) {
        context.shadowColor = color;
        context.shadowBlur = size * 0.4;
      }
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, size - 6, size - 6);
      context.restore();
      context.shadowBlur = 0;
    },
  },
  pastel: {
    palette: [
      null,
      '#a0e7e5', // I
      '#fdfd96', // O
      '#cdb4db', // T
      '#b5ead7', // S
      '#ffadad', // Z
      '#a2d2ff', // J
      '#ffd6a5', // L
      '#ffc8dd', // N
    ],
    gridColor: '#efe6dc',
    draw(context, px, py, size, color) {
      const r = size * 0.25;
      roundRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
      context.fillStyle = color;
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      context.stroke();
      // Soft highlight
      roundRectPath(context, px + 5, py + 4, size - 10, size * 0.25, r * 0.5);
      context.fillStyle = 'rgba(255, 255, 255, 0.45)';
      context.fill();
    },
  },
  pixel: {
    palette: [
      null,
      '#3cbcfc', // I
      '#f8d030', // O
      '#a050f0', // T
      '#58d854', // S
      '#e84030', // Z
      '#2860f0', // J
      '#f89838', // L
      '#f878c8', // N
    ],
    gridColor: '#1e1e30',
    draw(context, px, py, size, color) {
      const N = 6; // 6x6 sub-pixel texture
      const u = size / N;
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          let shade = null;
          if (i === N - 1 || j === N - 1) shade = 'rgba(0, 0, 0, 0.4)';          // bottom/right bevel
          else if (i === 0 || j === 0) shade = 'rgba(255, 255, 255, 0.4)';       // top/left bevel
          else if ((i === 1 && j === 1) || (i === 2 && j === 1) || (i === 1 && j === 2))
            shade = 'rgba(255, 255, 255, 0.55)';                                   // shine
          else if ((i + j) % 2 === 0 && i > 2 && j > 2) shade = 'rgba(0, 0, 0, 0.15)'; // dither
          if (shade) {
            context.fillStyle = shade;
            context.fillRect(px + i * u, py + j * u, u, u);
          }
        }
      }
      context.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
    },
  },
};

let currentSkin = 'retro';

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - nut (hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin];
  const color = (skin.palette || COLORS)[colorIndex];
  context.globalAlpha = alpha ?? 1;
  skin.draw(context, x * size, y * size, size, color);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = SKINS[currentSkin].gridColor || gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver) return;

  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) return; // let the select handle its own keys
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// Tema claro/oscuro
function applyTheme(theme) {
  currentTheme = theme;
  const t = THEMES[theme];
  COLORS = t.pieceColors;
  gridColor = t.gridColor;
  blockHighlight = t.blockHighlight;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  themeToggle.checked = theme === 'light';
  if (board) {
    draw();
    drawNext();
  }
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark');

// Skins visuales
function applySkin(skin) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, skin)) skin = 'retro';
  currentSkin = skin;
  document.documentElement.setAttribute('data-skin', skin);
  try { localStorage.setItem(SKIN_STORAGE_KEY, skin); } catch (_) { /* storage unavailable */ }
  skinSelect.value = skin;
  if (board) {
    draw();
    drawNext();
  }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur();
});

let savedSkin = null;
try { savedSkin = localStorage.getItem(SKIN_STORAGE_KEY); } catch (_) { /* storage unavailable */ }
applySkin(savedSkin);

// Weather Modal
const weatherBtn = document.getElementById('weather-btn');
const weatherModal = document.getElementById('weather-modal');
const weatherCloseBtn = document.getElementById('weather-close-btn');

weatherBtn.addEventListener('click', fetchAndShowWeather);
weatherCloseBtn.addEventListener('click', () => weatherModal.classList.add('hidden'));
weatherModal.addEventListener('click', (e) => {
  if (e.target === weatherModal) weatherModal.classList.add('hidden');
});

async function fetchAndShowWeather() {
  const LAT = '6.1631';
  const LON = '-75.4140';
  const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m&timezone=auto`;

  try {
    const res = await fetch(URL);
    const data = await res.json();
    const current = data.current;

    document.getElementById('temp').textContent = `${current.temperature_2m}°C`;
    document.getElementById('apparent').textContent = `${current.apparent_temperature}°C`;
    document.getElementById('humidity').textContent = `${current.relative_humidity_2m}%`;
    document.getElementById('wind').textContent = `${current.wind_speed_10m} km/h`;
    document.getElementById('timezone').textContent = `Zona: ${data.timezone}`;
    document.getElementById('update-time').textContent = `Actualizado: ${current.time}`;

    weatherModal.classList.remove('hidden');
  } catch (err) {
    console.error('Error fetching weather:', err);
    alert('Error al obtener el clima. Intenta de nuevo.');
  }
}

init();

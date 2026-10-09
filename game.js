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

// Skins change the block renderer and may override the theme palette/grid.
// A null pieceColors/gridColor means "inherit from the active light/dark theme".
const SKIN_STORAGE_KEY = 'tetris-skin';

const SKINS = {
  retro: { pieceColors: null, gridColor: null, drawCell: drawRetroCell },
  neon: {
    pieceColors: [
      null,
      '#00f0ff', // I
      '#fff200', // O
      '#bf00ff', // T
      '#39ff14', // S
      '#ff073a', // Z
      '#1f51ff', // J
      '#ff9900', // L
      '#ff00e6', // N
    ],
    gridColor: '#101828',
    drawCell: drawNeonCell,
  },
  pastel: {
    pieceColors: [
      null,
      '#a8e6f0', // I
      '#fff1a8', // O
      '#d7b8f3', // T
      '#b8e6c1', // S
      '#f7b2b7', // Z
      '#b3cdf5', // J
      '#ffd1a3', // L
      '#f8bbd9', // N
    ],
    gridColor: null,
    drawCell: drawPastelCell,
  },
  pixel: { pieceColors: null, gridColor: null, drawCell: drawPixelCell },
};

let currentTheme = 'dark';
let currentSkin = 'retro';
let drawCell = drawRetroCell;
let COLORS = THEMES.dark.pieceColors;
let gridColor = THEMES.dark.gridColor;
let blockHighlight = THEMES.dark.blockHighlight;

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
const pauseMenu = document.getElementById('pause-menu');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsBackBtn = document.getElementById('controls-back-btn');
const startLevelSelect = document.getElementById('start-level');

const START_LEVEL_STORAGE_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 10;
// Ignore game input briefly after resuming so held keys don't move the piece.
const RESUME_INPUT_GRACE_MS = 200;

let startLevel = 1;
let inputLockedUntil = 0;

const nameForm = document.getElementById('name-form');
const newRecordMsg = document.getElementById('new-record-msg');
const playerNameInput = document.getElementById('player-name');
const recordsEl = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const RECORDS_STORAGE_KEY = 'tetris-records';
const MAX_RECORDS = 5;

const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// combo = consecutive locks that cleared at least one line; maxCombo is the best of this game
let combo, maxCombo;
// Set at game over when the score qualifies for the top and the name has not been saved yet
let pendingRecord = false;

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
  combo = cleared ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = dropIntervalFor(level);
    updateHUD();
  }
}

function dropIntervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
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
  context.save();
  context.globalAlpha = alpha ?? 1;
  drawCell(context, x * size, y * size, size, COLORS[colorIndex]);
  context.restore();
}

function drawRetroCell(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = blockHighlight;
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonCell(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = size / 2;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 3, py + 3, size - 6, size - 6);
  context.shadowBlur = size / 4;
  context.globalAlpha *= 0.35;
  context.fillStyle = color;
  context.fillRect(px + 5, py + 5, size - 10, size - 10);
}

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawPastelCell(context, px, py, size, color) {
  const r = size / 4;
  roundedRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  context.lineWidth = 1.5;
  context.stroke();
  // soft shine in the top-left corner
  context.fillStyle = 'rgba(255, 255, 255, 0.45)';
  context.beginPath();
  context.arc(px + size * 0.32, py + size * 0.32, size * 0.1, 0, Math.PI * 2);
  context.fill();
}

function drawPixelCell(context, px, py, size, color) {
  const n = 6;                 // texture is an n×n grid of "pixels"
  const p = size / n;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let shade = null;
      if (i === 0 || j === 0) shade = 'rgba(255, 255, 255, 0.4)';          // lit edge
      else if (i === n - 1 || j === n - 1) shade = 'rgba(0, 0, 0, 0.35)';  // shadow edge
      else if ((i + j) % 2 === 0) shade = 'rgba(0, 0, 0, 0.1)';            // dither
      if (!shade) continue;
      context.fillStyle = shade;
      context.fillRect(Math.floor(px + j * p), Math.floor(py + i * p), Math.ceil(p), Math.ceil(p));
    }
  }
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
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
  restartBtn.textContent = 'Reiniciar';

  const records = loadRecords();
  const newBestCombo = maxCombo > records.bestCombo;
  const newMaxLines = lines > records.maxLines;
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords(records);

  const rank = qualifyingRank(records.scores, score);
  pendingRecord = rank !== -1;
  if (pendingRecord) {
    newRecordMsg.textContent = `¡Nuevo récord! Puesto #${rank + 1}`;
    playerNameInput.value = '';
    nameForm.classList.remove('hidden');
  }
  renderRecords(records, { highlightIndex: -1, newBestCombo, newMaxLines });
  overlay.classList.remove('hidden');
  if (pendingRecord) playerNameInput.focus();
}

function showPauseView(view) {
  pauseMain.classList.toggle('hidden', view !== 'main');
  pauseControls.classList.toggle('hidden', view !== 'controls');
  (view === 'main' ? resumeBtn : controlsBackBtn).focus();
}

function pause() {
  if (paused || gameOver) return;
  paused = true;
  cancelAnimationFrame(animId);
  pauseMenu.classList.remove('hidden');
  showPauseView('main');
}

function resume() {
  if (!paused || gameOver) return;
  paused = false;
  pauseMenu.classList.add('hidden');
  // Drop focus so Space/Enter can't re-trigger a menu button mid-game.
  if (document.activeElement) document.activeElement.blur();
  inputLockedUntil = performance.now() + RESUME_INPUT_GRACE_MS;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (paused) resume();
  else pause();
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
  if (pendingRecord) commitPendingRecord();
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = dropIntervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (document.activeElement) document.activeElement.blur();
  nameForm.classList.add('hidden');
  recordsEl.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!board || e.target === playerNameInput) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (e.repeat) return;
    if (paused && e.code === 'Escape' && !pauseControls.classList.contains('hidden')) {
      showPauseView('main');
      return;
    }
    togglePause();
    return;
  }
  // Menu open: let buttons/select handle their own keys, block everything else.
  if (paused || gameOver) return;
  if (performance.now() < inputLockedUntil) return;
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

// Menú de pausa
resumeBtn.addEventListener('click', resume);
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => showPauseView('controls'));
controlsBackBtn.addEventListener('click', () => showPauseView('main'));

for (let lvl = 1; lvl <= MAX_START_LEVEL; lvl++) {
  const opt = document.createElement('option');
  opt.value = lvl;
  opt.textContent = lvl;
  startLevelSelect.appendChild(opt);
}

function setStartLevel(lvl) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(1, lvl || 1));
  startLevelSelect.value = startLevel;
  localStorage.setItem(START_LEVEL_STORAGE_KEY, startLevel);
}

startLevelSelect.addEventListener('change', () => {
  setStartLevel(parseInt(startLevelSelect.value, 10));
});

setStartLevel(parseInt(localStorage.getItem(START_LEVEL_STORAGE_KEY), 10));
// Records (top scores, best combo, max lines) persisted in localStorage
function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_STORAGE_KEY));
    if (!data || !Array.isArray(data.scores)) return emptyRecords();
    return {
      scores: data.scores.slice(0, MAX_RECORDS),
      bestCombo: Number(data.bestCombo) || 0,
      maxLines: Number(data.maxLines) || 0,
    };
  } catch {
    return emptyRecords();
  }
}

function saveRecords(records) {
  localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
}

// Index the score would take in the sorted top list, or -1 if it does not make it
function qualifyingRank(scores, value) {
  if (value <= 0) return -1;
  const idx = scores.findIndex(r => value > r.score);
  if (idx !== -1) return idx;
  return scores.length < MAX_RECORDS ? scores.length : -1;
}

function commitPendingRecord() {
  pendingRecord = false;
  nameForm.classList.add('hidden');
  const records = loadRecords();
  const rank = qualifyingRank(records.scores, score);
  if (rank === -1) return -1;
  const name = playerNameInput.value.trim() || 'Anónimo';
  records.scores.splice(rank, 0, { name, score, lines, combo: maxCombo });
  records.scores.length = Math.min(records.scores.length, MAX_RECORDS);
  saveRecords(records);
  renderRecords(records, { highlightIndex: rank });
  return rank;
}

function renderRecords(records, { highlightIndex = -1, newBestCombo = false, newMaxLines = false } = {}) {
  recordsBody.replaceChildren();
  if (!records.scores.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'records-empty';
    td.textContent = 'Sin récords todavía';
    tr.appendChild(td);
    recordsBody.appendChild(tr);
  }
  records.scores.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.className = 'records-highlight';
    const cells = [`${i + 1}.`, r.name, r.score.toLocaleString()];
    cells.forEach((text, c) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (c === 2) td.className = 'records-score';
      tr.appendChild(td);
    });
    recordsBody.appendChild(tr);
  });
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
  bestComboEl.classList.toggle('records-new', newBestCombo);
  maxLinesEl.classList.toggle('records-new', newMaxLines);
  recordsEl.classList.remove('hidden');
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitPendingRecord();
  restartBtn.focus();
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords?')) return;
  localStorage.removeItem(RECORDS_STORAGE_KEY);
  renderRecords(emptyRecords());
});

function showStartScreen() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = 'Pulsa Jugar para empezar';
  restartBtn.textContent = 'Jugar';
  nameForm.classList.add('hidden');
  renderRecords(loadRecords());
  overlay.classList.remove('hidden');
}

// Tema claro/oscuro
function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  themeToggle.checked = theme === 'light';
  refreshPalette();
}

// Skin
function applySkin(skin) {
  currentSkin = skin;
  drawCell = SKINS[skin].drawCell;
  document.documentElement.setAttribute('data-skin', skin);
  localStorage.setItem(SKIN_STORAGE_KEY, skin);
  skinSelect.value = skin;
  refreshPalette();
}

// Resolves the active colors from skin overrides falling back to the theme.
function refreshPalette() {
  const t = THEMES[currentTheme];
  const s = SKINS[currentSkin];
  COLORS = s.pieceColors || t.pieceColors;
  gridColor = s.gridColor || t.gridColor;
  blockHighlight = t.blockHighlight;
  if (board) {
    draw();
    drawNext();
  }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // keep arrow keys driving the game, not the select
});

const savedSkin = localStorage.getItem(SKIN_STORAGE_KEY);
applySkin(Object.hasOwn(SKINS, savedSkin) ? savedSkin : 'retro');

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark');

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

showStartScreen();

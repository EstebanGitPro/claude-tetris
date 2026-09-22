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
  trackCombo(cleared);
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = blockHighlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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
  overlay.classList.remove('hidden');
  showGameOverRecords(); // after unhiding the overlay so the name input can take focus
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
  resetRecordsForNewGame();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (shouldIgnoreGameKeys(e)) return;
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

// Records
const RECORDS_STORAGE_KEY = 'tetris-records';
const RECORDS_MAX = 5;
const NAME_MAX_LENGTH = 12;
const DEFAULT_PLAYER_NAME = 'Jugador';

const startScreen = document.getElementById('start-screen');
const startRecordsBody = document.getElementById('start-records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const overlayRecords = document.getElementById('overlay-records');
const overlayRecordsBody = document.getElementById('overlay-records-body');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const newRecordMsg = document.getElementById('new-record-msg');

let combo = 0;
let maxComboThisGame = 0;
let pendingRecord = null; // entry awaiting a name on the game-over overlay
let resetArmTimer = null;

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function toNonNegativeInt(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const score = toNonNegativeInt(entry.score);
  const lines = toNonNegativeInt(entry.lines);
  const level = toNonNegativeInt(entry.level);
  if (typeof entry.name !== 'string' || score === null || lines === null || level === null) return null;
  return {
    name: entry.name.slice(0, NAME_MAX_LENGTH),
    score,
    lines,
    level,
    date: typeof entry.date === 'string' ? entry.date : '',
  };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return emptyRecords();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyRecords();
    const top = Array.isArray(data.top)
      ? data.top.map(sanitizeEntry).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, RECORDS_MAX)
      : [];
    return {
      top,
      bestCombo: toNonNegativeInt(data.bestCombo) ?? 0,
      maxLines: toNonNegativeInt(data.maxLines) ?? 0,
    };
  } catch {
    return emptyRecords();
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage unavailable (private mode, quota): records just won't persist.
  }
}

function qualifiesForTop(records, value) {
  if (value <= 0) return false;
  if (records.top.length < RECORDS_MAX) return true;
  return value > records.top[records.top.length - 1].score;
}

function formatRecordDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// User data is only ever written through textContent.
function renderRecordsTable(tbody, top, highlightIndex) {
  tbody.replaceChildren();
  if (!top.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'records-empty';
    td.textContent = 'Sin records todavía';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  top.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.className = 'records-highlight';
    const cells = [
      String(i + 1),
      entry.name,
      entry.score.toLocaleString(),
      String(entry.lines),
      String(entry.level),
      formatRecordDate(entry.date),
    ];
    cells.forEach((text, col) => {
      const td = document.createElement('td');
      if (col === 1) td.className = 'records-name';
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderStartScreen() {
  const records = loadRecords();
  renderRecordsTable(startRecordsBody, records.top, -1);
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
}

function showStartScreen() {
  renderStartScreen();
  startScreen.classList.remove('hidden');
  playBtn.focus();
}

function isStartScreenVisible() {
  return !startScreen.classList.contains('hidden');
}

function shouldIgnoreGameKeys(e) {
  return isStartScreenVisible() || e.target === nameInput;
}

function trackCombo(cleared) {
  combo = cleared > 0 ? combo + 1 : 0;
  if (combo > maxComboThisGame) maxComboThisGame = combo;
}

function resetRecordsForNewGame() {
  // Restarting without pressing "Guardar" must not lose a top-5 score.
  if (pendingRecord) commitPendingRecord();
  combo = 0;
  maxComboThisGame = 0;
  overlayRecords.classList.add('hidden');
  nameForm.classList.add('hidden');
  newRecordMsg.classList.add('hidden');
}

function showGameOverRecords() {
  const records = loadRecords();
  // Stats are updated on every game over, top-5 or not.
  records.bestCombo = Math.max(records.bestCombo, maxComboThisGame);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords(records);

  if (qualifiesForTop(records, score)) {
    pendingRecord = { score, lines, level, date: new Date().toISOString() };
    nameInput.value = '';
    nameForm.classList.remove('hidden');
  }
  renderRecordsTable(overlayRecordsBody, records.top, -1);
  overlayRecords.classList.remove('hidden');
  if (pendingRecord) nameInput.focus();
}

// Persists pendingRecord under the typed name (or the default) and returns
// the updated top list plus the new entry's index (-1 if it fell out).
function commitPendingRecord() {
  const name = nameInput.value.trim().slice(0, NAME_MAX_LENGTH) || DEFAULT_PLAYER_NAME;
  const entry = { name, ...pendingRecord };
  pendingRecord = null;

  const records = loadRecords();
  records.top.push(entry);
  records.top.sort((a, b) => b.score - a.score);
  records.top = records.top.slice(0, RECORDS_MAX);
  saveRecords(records);
  return { top: records.top, index: records.top.indexOf(entry) };
}

function savePendingRecord() {
  if (!pendingRecord) return;
  const { top, index } = commitPendingRecord();

  nameInput.blur();
  nameForm.classList.add('hidden');
  renderRecordsTable(overlayRecordsBody, top, index);
  if (index !== -1) newRecordMsg.classList.remove('hidden');
}

function disarmResetButton() {
  clearTimeout(resetArmTimer);
  resetArmTimer = null;
  resetRecordsBtn.classList.remove('armed');
  resetRecordsBtn.textContent = 'Resetear records';
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  savePendingRecord();
});

playBtn.addEventListener('click', () => {
  disarmResetButton();
  startScreen.classList.add('hidden');
  playBtn.blur();
  init();
});

// Two-step inline confirm instead of a blocking confirm() dialog.
resetRecordsBtn.addEventListener('click', () => {
  if (!resetRecordsBtn.classList.contains('armed')) {
    resetRecordsBtn.classList.add('armed');
    resetRecordsBtn.textContent = '¿Seguro? Clic de nuevo';
    resetArmTimer = setTimeout(disarmResetButton, 3000);
    return;
  }
  disarmResetButton();
  try {
    localStorage.removeItem(RECORDS_STORAGE_KEY);
  } catch {
    // Ignore: nothing to clear if storage is unavailable.
  }
  renderStartScreen();
});

showStartScreen();

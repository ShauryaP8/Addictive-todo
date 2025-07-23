/*************************
 * DOM HOOKS
 *************************/
const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');
const xpDisplay = document.getElementById('xp');
const levelDisplay = document.getElementById('level');
const streakDisplay = document.getElementById('streak');
const zenMode = document.getElementById('zen-mode');
const ding = document.getElementById('ding');
const alarm = document.getElementById('alarm');

/* Focus Panel */
const focusPanel = document.getElementById('focus-panel');
const focusPanelClose = document.getElementById('focus-panel-close');
const focusPanelTaskLabel = document.getElementById('focus-panel-task-label');
const focusTimerRing = document.getElementById('focus-timer-ring');
const focusTimerTime = document.getElementById('focus-timer-time');
const focusModeBtns = document.querySelectorAll('.focus-mode-btn');
const focusStartStopBtn = document.getElementById('focus-start-stop');
const focusResetBtn = document.getElementById('focus-reset');
const focusBonusBanner = document.getElementById('focus-bonus-banner');
const focusBonusUrgent = document.getElementById('focus-bonus-urgent');

/*************************
 * CONFIG
 *************************/
const CONFIG = {
  xpPerTask: 20,
  xpBonusFocusComplete: 10,
  xpBonusUrgentComplete: 20, // after timer ends, 60s window
  levelXP: 100,
  focusDurations: {
    focus: 25 * 60, // seconds
    short: 5 * 60,
    long: 15 * 60,
  },
  urgentGrace: 60 // seconds after focus session ends
};

/*************************
 * STATE (persistent core)
 *************************/
let tasks = JSON.parse(localStorage.getItem('tasks')) || []; // [{id,text,completed,pomos}]
let xp = parseInt(localStorage.getItem('xp')) || 0;
let level = parseInt(localStorage.getItem('level')) || 1;
let streak = parseInt(localStorage.getItem('streak')) || 0;
let lastCompletedDate = localStorage.getItem('lastCompletedDate') || null;

/* Focus Timer State (persistent) */
let focusState = JSON.parse(localStorage.getItem('focusState')) || {
  taskId: null,
  mode: 'focus',     // 'focus'|'short'|'long'
  remaining: CONFIG.focusDurations.focus, // seconds
  isRunning: false,
  lastTick: null,    // ms timestamp
  sessionDoneAt: null // ms timestamp when session hit 0 (for urgent bonus window)
};

/*************************
 * PERSISTENCE
 *************************/
function saveData() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
  localStorage.setItem('xp', xp);
  localStorage.setItem('level', level);
  localStorage.setItem('streak', streak);
  localStorage.setItem('lastCompletedDate', lastCompletedDate);
  localStorage.setItem('focusState', JSON.stringify(focusState));
}

/*************************
 * STATS / LEVEL / STREAK
 *************************/
function updateStats() {
  xpDisplay.textContent = xp % CONFIG.levelXP;
  levelDisplay.textContent = level;
  streakDisplay.textContent = streak;
}

function awardXP(amount) {
  xp += amount;
  while (xp >= CONFIG.levelXP) {
    xp -= CONFIG.levelXP;
    level++;
  }
  updateStats();
}

/*************************
 * TASK UI + LOGIC
 *************************/
function createTaskElement(task) {
  const li = document.createElement('li');
  li.dataset.id = task.id;
  li.textContent = task.text;

  // keep text separated so we can append buttons cleanly
  const textSpan = document.createElement('span');
  textSpan.textContent = task.text;
  li.textContent = '';
  li.appendChild(textSpan);

  const controls = document.createElement('span');

  const focusBtn = document.createElement('button');
  focusBtn.textContent = '⏱';
  focusBtn.className = 'task-focus-btn';
  focusBtn.title = 'Focus on this task';
  focusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openFocusPanel(task.id);
  });

  controls.appendChild(focusBtn);
  li.appendChild(controls);

  if (task.completed) li.classList.add('completed');

  /* Complete on click */
  li.addEventListener('click', () => {
    if (li.classList.contains('completed')) return;
    markTaskComplete(task.id);
  });

  return li;
}

function renderTasks() {
  taskList.innerHTML = '';
  tasks.forEach(t => {
    const li = createTaskElement(t);
    taskList.appendChild(li);
  });
  checkZen();
}

function addTask(text) {
  const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
  const task = { id, text, completed: false, pomos: 0 };
  tasks.push(task);
  saveData();
  renderTasks();
}

function markTaskComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task || task.completed) return;
  task.completed = true;

  // base XP
  awardXP(CONFIG.xpPerTask);

  // streak update
  streak += 1;
  lastCompletedDate = new Date().toDateString();

  ding.play();
  triggerConfetti();
  checkZen();

  // bonus if in active focus session
  maybeAwardFocusBonus(id);

  saveData();
  renderTasks();
}

/*************************
 * FOCUS BONUS LOGIC
 *************************/
function maybeAwardFocusBonus(taskId) {
  if (!focusState.taskId || focusState.taskId !== taskId) return;

  let bonus = 0;
  if (focusState.isRunning && focusState.remaining > 0) {
    bonus = CONFIG.xpBonusFocusComplete;
    showTransientBanner(`${CONFIG.xpBonusFocusComplete} bonus XP for finishing in focus!`);
  } else if (!focusState.isRunning && focusState.sessionDoneAt) {
    const now = Date.now();
    if (now - focusState.sessionDoneAt <= CONFIG.urgentGrace * 1000) {
      bonus = CONFIG.xpBonusUrgentComplete;
      showTransientBanner(`🔥 DOUBLE BONUS! +${CONFIG.xpBonusUrgentComplete} XP!`);
    }
  }

  if (bonus > 0) {
    awardXP(bonus);
  }

  // end focus session after completion
  focusState.isRunning = false;
  focusState.remaining = 0;
  saveData();
  updateFocusUI();
}

/*************************
 * ZEN CHECK
 *************************/
function checkZen() {
  const incomplete = tasks.filter(t => !t.completed);
  zenMode.style.display = incomplete.length === 0 ? 'block' : 'none';
}

/*************************
 * STREAK RESET ON DAY ROLLOVER
 *************************/
function checkStreakDate() {
  const today = new Date().toDateString();
  if (!lastCompletedDate) return;
  if (lastCompletedDate === today) return;
  const diffDays = (new Date(today) - new Date(lastCompletedDate)) / (1000 * 3600 * 24);
  if (diffDays >= 1) {
    streak = 0;
    updateStats();
    saveData();
  }
}

/*************************
 * CONFETTI
 *************************/
function triggerConfetti() {
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti';
  canvas.style.position = 'fixed';
  canvas.style.top = 0;
  canvas.style.left = 0;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const particles = [];
  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - 50,
      r: Math.random() * 6 + 4,
      d: Math.random() * 50,
      color: `hsl(${Math.random() * 360},100%,50%)`,
      tilt: Math.random() * 10 - 5,
      tiltAngle: 0
    });
  }

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt, p.y);
      ctx.lineTo(p.x, p.y + p.tilt + p.r);
      ctx.stroke();
    });
    update();
  }
  function update() {
    particles.forEach(p => {
      p.y += Math.cos(p.d) + 3;
      p.tiltAngle += 0.1;
      p.tilt = Math.sin(p.tiltAngle) * 15;
    });
  }

  const duration = 2000;
  const start = Date.now();
  (function animate(){
    draw();
    if (Date.now() - start < duration) requestAnimationFrame(animate);
    else document.body.removeChild(canvas);
  })();
}

/*************************
 * TRANSIENT BANNER (mini toast)
 *************************/
function showTransientBanner(msg, ms=2500) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.position='fixed';
  el.style.bottom='100px';
  el.style.left='50%';
  el.style.transform='translateX(-50%)';
  el.style.padding='10px 20px';
  el.style.background='#ffcc70';
  el.style.color='#000';
  el.style.borderRadius='8px';
  el.style.fontWeight='bold';
  el.style.zIndex='9000';
  document.body.appendChild(el);
  setTimeout(()=>document.body.removeChild(el), ms);
}

/*************************
 * FOCUS PANEL OPEN/CLOSE
 *************************/
function openFocusPanel(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  focusState.taskId = taskId;

  focusPanelTaskLabel.textContent = `Focus: ${task.text}`;
  focusPanel.classList.remove('hidden');
  focusPanel.classList.add('visible');
  focusPanel.setAttribute('aria-hidden','false');

  // if switching tasks mid-session, reset?
  if (focusState.taskId !== taskId || focusState.remaining <= 0) {
    // no auto reset: keep current timer if running; else load default
  }
  updateFocusUI();
  saveData();
}

function closeFocusPanel() {
  focusPanel.classList.add('hidden');
  focusPanel.classList.remove('visible');
  focusPanel.setAttribute('aria-hidden','true');
}

/*************************
 * FOCUS MODE SELECT
 *************************/
focusModeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    focusModeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    setFocusMode(mode, true);
  });
});

function setFocusMode(mode, resetTime=false) {
  if (!CONFIG.focusDurations[mode]) return;
  focusState.mode = mode;
  if (resetTime) {
    focusState.remaining = CONFIG.focusDurations[mode];
    focusState.isRunning = false;
    focusState.sessionDoneAt = null;
  }
  saveData();
  updateFocusUI();
}

/*************************
 * FOCUS TIMER CONTROLS
 *************************/
focusStartStopBtn.addEventListener('click', () => {
  if (focusState.isRunning) {
    focusState.isRunning = false;
  } else {
    // if session already ended & not reset, restart?
    if (focusState.remaining <= 0) {
      focusState.remaining = CONFIG.focusDurations[focusState.mode];
      focusState.sessionDoneAt = null;
    }
    focusState.isRunning = true;
    focusState.lastTick = performance.now();
  }
  saveData();
  updateFocusUI();
});

focusResetBtn.addEventListener('click', () => {
  focusState.remaining = CONFIG.focusDurations[focusState.mode];
  focusState.isRunning = false;
  focusState.sessionDoneAt = null;
  saveData();
  updateFocusUI();
});

focusPanelClose.addEventListener('click', closeFocusPanel);

/*************************
 * TIMER LOOP
 *************************/
function tickFocusTimer(now) {
  if (!focusState.isRunning) return;
  if (focusState.remaining <= 0) return;
  const last = focusState.lastTick || now;
  const delta = (now - last) / 1000; // seconds
  focusState.lastTick = now;
  focusState.remaining -= delta;
  if (focusState.remaining <= 0) {
    focusState.remaining = 0;
    focusState.isRunning = false;
    focusState.sessionDoneAt = Date.now();
    alarm.play();
    focusBonusUrgent.classList.remove('hidden');
    // vibrate if supported
    if (navigator.vibrate) navigator.vibrate([100,50,100]);
  }
  saveData();
  updateFocusUI();
}

/*************************
 * UPDATE FOCUS UI
 *************************/
function updateFocusUI() {
  // time text
  const sec = Math.max(0, Math.round(focusState.remaining));
  const mm = Math.floor(sec / 60).toString().padStart(2,'0');
  const ss = (sec % 60).toString().padStart(2,'0');
  focusTimerTime.textContent = `${mm}:${ss}`;

  // ring progress
  const total = CONFIG.focusDurations[focusState.mode];
  const percent = total === 0 ? 0 : ((total - sec) / total) * 100;
  focusTimerRing.style.setProperty('--progress', `${percent}%`);

  // start/stop text
  focusStartStopBtn.textContent = focusState.isRunning ? 'Pause' : 'Start';

  // show/hide banners
  const task = tasks.find(t => t.id === focusState.taskId);
  const taskDone = task ? task.completed : true;

  if (taskDone) {
    focusBonusBanner.classList.add('hidden');
    focusBonusUrgent.classList.add('hidden');
  } else {
    if (focusState.remaining > 0 && focusState.isRunning) {
      focusBonusBanner.classList.remove('hidden');
      focusBonusUrgent.classList.add('hidden');
    } else if (!focusState.isRunning && focusState.remaining === 0 && focusState.sessionDoneAt) {
      const graceLeft = CONFIG.urgentGrace - Math.floor((Date.now() - focusState.sessionDoneAt)/1000);
      if (graceLeft > 0) {
        focusBonusUrgent.textContent = `Time’s up! Complete within ${graceLeft}s for DOUBLE XP!`;
        focusBonusUrgent.classList.remove('hidden');
      } else {
        focusBonusUrgent.classList.add('hidden');
      }
      focusBonusBanner.classList.add('hidden');
    } else {
      focusBonusBanner.classList.add('hidden');
      focusBonusUrgent.classList.add('hidden');
    }
  }
}

/*************************
 * MAIN ANIMATION LOOP
 *************************/
function loop(now) {
  tickFocusTimer(now);
  // if urgent window active, update text countdown
  if (focusState.sessionDoneAt && !focusState.isRunning && focusState.remaining === 0) {
    updateFocusUI();
  }
  requestAnimationFrame(loop);
}

/*************************
 * INIT
 *************************/
taskForm.addEventListener('submit', e => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;
  addTask(text);
  taskInput.value = '';
});

function init() {
  checkStreakDate();
  updateStats();
  renderTasks();
  updateFocusUI();
  requestAnimationFrame(loop);
}
init();

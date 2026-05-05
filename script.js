// ================== IMPORTS ==================
import { TwistyPlayer } from "https://cdn.cubing.net/js/cubing/twisty";
import { randomScrambleForEvent } from "https://cdn.cubing.net/js/cubing/scramble";
import { update, get, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ================== FIREBASE ==================
const db = window.db;
const ref = window.ref;
const onValue = window.onValue;

// ================== PLAYER ==================
let playerData = JSON.parse(localStorage.getItem("player")) || {
  id: crypto.randomUUID(),
  nome: "Player_" + Math.floor(Math.random() * 1000),
};

localStorage.setItem("player", JSON.stringify(playerData));

// ================== TEMPOS ==================
let tempos = JSON.parse(localStorage.getItem("tempos")) || [];

// ================== ELEMENTOS ==================
const timerEl = document.getElementById("timer");
const timerOponenteEl = document.getElementById("timerOponente");
const scrambleEl = document.getElementById("scramble");
const statusSala = document.getElementById("statusSala");
const area = document.getElementById("areaTimer");

// ================== ESTADO ==================
let salaAtualId = localStorage.getItem("roomId") || null;
let startTime;
let interval;
let running = false;

// INSPEÇÃO
let inspecionando = false;
let tempoInspecao = 15;
let intervaloInspecao = null;

// CONTROLE
let segurando = false;
let pronto = false;
let timeoutSegurar;
let keyPressed = false;

// ================== CUBO ==================
const cubePlayer = new TwistyPlayer({
  puzzle: "3x3x3",
  alg: ""
});
document.getElementById("cubo").appendChild(cubePlayer);

// ================== STATUS ==================
function atualizarStatus(txt) {
  statusSala.innerText = salaAtualId 
    ? `Sala ${salaAtualId} | ${txt}` 
    : txt;
}

// ================== SCRAMBLE ==================
async function novoScramble() {
  const scramble = await randomScrambleForEvent("333");
  scrambleEl.innerText = scramble;

  // 🔥 FIX MOBILE
  setTimeout(() => {
    cubePlayer.alg = scramble;
  }, 50);
}

// ================== TIMER ==================
function iniciarTimer() {
  clearInterval(intervaloInspecao);
  inspecionando = false;

  startTime = Date.now();

  if (salaAtualId) {
    update(ref(db, `rooms/${salaAtualId}/players/${playerData.id}`), {
      tempoLive: 0
    });
  }

  interval = setInterval(() => {
    let tempo = (Date.now() - startTime) / 1000;
    timerEl.innerText = tempo.toFixed(2);

    if (Math.floor(tempo * 10) !== Math.floor((tempo - 0.01) * 10)) {
      enviarTempoLive();
    }

  }, 10);

  running = true;
}

function pararTimer() {
  clearInterval(interval);
  running = false;

  let tempo = timerEl.innerText;

  if (tempo === "DNF") tempo = NaN;
  else tempo = parseFloat(tempo);

  if (salaAtualId) {
    update(ref(db, `rooms/${salaAtualId}/players/${playerData.id}`), {
      tempo,
      tempoLive: null
    });
  }

  // 🔥 SCRAMBLE SOLO
  if (!salaAtualId) {
    novoScramble();
  }

  if (!isNaN(tempo)) {
    tempos.push(tempo);
    localStorage.setItem("tempos", JSON.stringify(tempos));
    atualizarStats();
  }

  if (db && !isNaN(tempo) && tempo >= 2) {
    const playerRef = ref(db, "ranking/" + playerData.id);

    get(playerRef).then((snap) => {
      const atual = snap.val();

      if (!atual || tempo < atual.tempo) {
        update(playerRef, {
          nome: playerData.nome,
          tempo: tempo,
          data: Date.now()
        });
      }
    });
  }
}

// ================== INSPEÇÃO ==================
function iniciarInspecao() {
  inspecionando = true;
  tempoInspecao = 15;

  timerEl.innerText = tempoInspecao;
  timerEl.style.color = "#facc15";

  intervaloInspecao = setInterval(() => {
    tempoInspecao--;
    timerEl.innerText = tempoInspecao;

    if (tempoInspecao <= 0) timerEl.style.color = "red";

    if (tempoInspecao <= -2) {
      timerEl.innerText = "DNF";
      clearInterval(intervaloInspecao);
    }
  }, 1000);
}

// ================== CONTROLE ==================
function handlePressStart() {
  if (running) return pararTimer();

  if (!inspecionando) return iniciarInspecao();

  if (!segurando) {
    segurando = true;
    timerEl.style.color = "red";

    timeoutSegurar = setTimeout(() => {
      pronto = true;
      timerEl.style.color = "#22c55e";
    }, 400);
  }
}

function handlePressEnd() {
  if (pronto) iniciarTimer();

  segurando = false;
  pronto = false;
  clearTimeout(timeoutSegurar);

  if (!running && inspecionando) {
    timerEl.style.color = "#facc15";
  }
}

// ================== PC ==================
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !keyPressed) {
    e.preventDefault();
    keyPressed = true;
    handlePressStart();
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    keyPressed = false;
    handlePressEnd();
  }
});

// ================== MOBILE ==================
area.addEventListener("touchstart", (e) => {
  e.preventDefault();
  handlePressStart();
}, { passive: false });

area.addEventListener("touchend", (e) => {
  e.preventDefault();
  handlePressEnd();
}, { passive: false });

// ================== OUVIR SALA ==================
if (salaAtualId) {
  onValue(ref(db, "rooms/" + salaAtualId), (snap) => {
    const sala = snap.val();
    if (!sala) return;

    const players = sala.players || {};
    const ids = Object.keys(players);

    const opponentId = ids.find(id => id !== playerData.id);

    // 🔥 SCRAMBLE FIX MOBILE
    if (sala.scramble) {
      scrambleEl.innerText = sala.scramble;

      setTimeout(() => {
        cubePlayer.alg = sala.scramble;
      }, 50);
    }

    if (opponentId && players[opponentId]) {
      const op = players[opponentId];

      if (op.tempoLive != null) {
        timerOponenteEl.innerText = op.tempoLive.toFixed(2);
      } else if (op.tempo != null) {
        timerOponenteEl.innerText = op.tempo.toFixed(2);
      }
    }
  });
}

// ================== RANKING ==================
function carregarRanking() {
  if (!db) return;

  onValue(ref(db, "ranking"), (snapshot) => {
    const data = snapshot.val();
    const lista = document.getElementById("ranking");

    if (!lista) return;

    lista.innerHTML = "";

    if (!data) {
      lista.innerHTML = "<li>Nenhum tempo ainda</li>";
      return;
    }

    Object.values(data)
      .sort((a, b) => a.tempo - b.tempo)
      .slice(0, 10)
      .forEach((t, i) => {
        const li = document.createElement("li");
        li.innerText = `#${i+1} ${t.nome} - ${t.tempo.toFixed(2)}s`;
        lista.appendChild(li);
      });
  });
}

// ================== STATS ==================
function atualizarStats() {
  if (!tempos.length) return;

  const validos = tempos.filter(t => typeof t === "number" && !isNaN(t));
  if (!validos.length) return;

  const best = Math.min(...validos);
  const media = validos.reduce((a, b) => a + b, 0) / validos.length;

  document.getElementById("best").innerText = best.toFixed(2) + "s";
  document.getElementById("media").innerText = media.toFixed(2) + "s";
  document.getElementById("total").innerText = validos.length;
}

// ================== INIT ==================
if (!salaAtualId) {
  novoScramble();
}

carregarRanking();
atualizarStats();

// ================== LIVE ==================
function enviarTempoLive() {
  if (!salaAtualId || !running) return;

  const tempo = parseFloat(timerEl.innerText);

  update(ref(db, `rooms/${salaAtualId}/players/${playerData.id}`), {
    tempoLive: tempo
  });
}
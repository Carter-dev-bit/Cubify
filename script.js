// ================== IMPORTS ==================
import { TwistyPlayer } from "https://cdn.cubing.net/js/cubing/twisty";
import { randomScrambleForEvent } from "https://cdn.cubing.net/js/cubing/scramble";
import { update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ================== FIREBASE ==================
const db = window.db;
const ref = window.ref;
const push = window.push;
const onValue = window.onValue;

// ================== PLAYER ==================
let playerData = JSON.parse(localStorage.getItem("player")) || {
  id: crypto.randomUUID(),
  nome: "Player_" + Math.floor(Math.random() * 1000),
  avatar: "🧊",
  rating: 1000
};

if (!playerData.rating) playerData.rating = 1000;
localStorage.setItem("player", JSON.stringify(playerData));

// ================== TEMPOS ==================
let tempos = JSON.parse(localStorage.getItem("tempos")) || [];

// ================== RANK ==================
function getRank(rating) {
  if (rating < 800) return "Bronze";
  if (rating < 1000) return "Prata";
  if (rating < 1200) return "Ouro";
  if (rating < 1400) return "Platina";
  if (rating < 1600) return "Diamante";
  return "Mestre";
}

// ================== CUBO ==================
const cubePlayer = new TwistyPlayer({
  puzzle: "3x3x3",
  alg: ""
});
document.getElementById("cubo").appendChild(cubePlayer);

// ================== ELEMENTOS ==================
const timerEl = document.getElementById("timer");
const scrambleEl = document.getElementById("scramble");

// ================== ESTADO ==================
let startTime;
let interval;
let running = false;

let segurando = false;
let pronto = false;
let timeoutSegurar;

let inspecionando = false;
let tempoInspecao = 15;
let intervaloInspecao;

// ================== SCRAMBLE ==================
async function novoScramble() {
  const scramble = await randomScrambleForEvent("333");
  scrambleEl.innerText = scramble;

  cubePlayer.alg = scramble;
  cubePlayer.play();
}

// ================== TECLADO ==================
document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();

    if (running) return pararTimer();

    if (!inspecionando && !segurando) return iniciarInspecao();

    if (inspecionando && !segurando) {
      segurando = true;
      timerEl.style.color = "red";

      timeoutSegurar = setTimeout(() => {
        pronto = true;
        timerEl.style.color = "#22c55e";
      }, 500);
    }
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    e.preventDefault();

    if (pronto) iniciarTimer();

    segurando = false;
    pronto = false;
    clearTimeout(timeoutSegurar);
    timerEl.style.color = "white";
  }
});

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

// ================== TIMER ==================
function iniciarTimer() {
  clearInterval(intervaloInspecao);
  inspecionando = false;

  startTime = Date.now();
  interval = setInterval(updateTimer, 10);
  running = true;
}

function pararTimer() {
  clearInterval(interval);
  running = false;

  let tempoRaw = parseFloat(timerEl.innerText);

  let solve = {
    tempo: tempoRaw,
    dnf: false,
    penalty: 0,
    data: Date.now()
  };

  if (tempoInspecao <= -2) solve.dnf = true;
  else if (tempoInspecao < 0) {
    solve.penalty = 2;
    solve.tempo += 2;
  }

  if (!solve.dnf) atualizarElo(solve.tempo);

  tempos.push(solve);
  localStorage.setItem("tempos", JSON.stringify(tempos));

  renderTempos();
  atualizarStats();

  // 🔥 SALA (1v1)
  const roomId = localStorage.getItem("roomId");
  if (roomId && db) {
    update(ref(db, `rooms/${roomId}/players/${playerData.id}`), {
      tempo: solve.tempo
    });
  }

  // 🔥 FIREBASE GLOBAL
  if (db) {
    push(ref(db, "ranking"), {
      playerId: playerData.id,
      nome: playerData.nome,
      avatar: playerData.avatar,
      tempo: solve.tempo,
      dnf: solve.dnf,
      rating: playerData.rating,
      data: Date.now()
    });
  }

  novoScramble();
}

function updateTimer() {
  let tempo = Date.now() - startTime;
  timerEl.innerText = (tempo / 1000).toFixed(2);
}

// ================== STATS ==================
function atualizarStats() {
  let validos = tempos.filter(t => !t.dnf);
  if (validos.length === 0) return;

  let best = Math.min(...validos.map(t => t.tempo));
  document.getElementById("best").innerText = best.toFixed(2) + "s";

  let media = validos.reduce((a, b) => a + b.tempo, 0) / validos.length;
  document.getElementById("media").innerText = media.toFixed(2) + "s";

  document.getElementById("total").innerText = tempos.length;
}

// ================== ELO ==================
function atualizarElo(tempoAtual) {
  let validos = tempos.filter(t => !t.dnf);
  if (validos.length < 5) return;

  let media = validos.reduce((a, b) => a + b.tempo, 0) / validos.length;
  let diff = media - tempoAtual;

  let ganho = Math.max(-25, Math.min(25, diff * 5));

  playerData.rating += Math.round(ganho);
  if (playerData.rating < 0) playerData.rating = 0;

  localStorage.setItem("player", JSON.stringify(playerData));
}

// ================== RANKING ==================
function carregarRanking() {
  if (!db) return;

  onValue(ref(db, "ranking"), (snapshot) => {
    const data = snapshot.val();
    const lista = document.getElementById("ranking");

    lista.innerHTML = "";
    if (!data) return;

    let melhores = {};

    Object.values(data).forEach(t => {
      if (t.dnf) return;
      if (!melhores[t.playerId] || t.tempo < melhores[t.playerId].tempo) {
        melhores[t.playerId] = t;
      }
    });

    Object.values(melhores)
      .sort((a, b) => a.tempo - b.tempo)
      .slice(0, 10)
      .forEach((t, i) => {
        let li = document.createElement("li");
        li.innerText = `#${i+1} ${t.avatar} ${t.nome} (${getRank(t.rating)}) - ${t.tempo.toFixed(2)}s`;
        lista.appendChild(li);
      });
  });
}

// ================== SALAS ==================
function criarSala() {
  if (!db) return;

  const salaRef = push(ref(db, "rooms"));

  update(salaRef, {
    host: playerData.id,
    status: "waiting",
    scramble: "",
    players: {
      [playerData.id]: {
        nome: playerData.nome,
        avatar: playerData.avatar,
        tempo: null
      }
    }
  });

  localStorage.setItem("roomId", salaRef.key);
  entrarSala(salaRef.key);

  alert("Código da sala: " + salaRef.key);
}

function entrarSala(roomId) {
  if (!db) return;

  update(ref(db, `rooms/${roomId}/players/${playerData.id}`), {
    nome: playerData.nome,
    avatar: playerData.avatar,
    tempo: null
  });

  ouvirSala(roomId);
}

function ouvirSala(roomId) {
  onValue(ref(db, "rooms/" + roomId), async (snapshot) => {
    const sala = snapshot.val();
    if (!sala) return;

    const players = sala.players || {};
    const ids = Object.keys(players);

    if (ids.length === 2 && sala.status === "waiting") {
      const scramble = await randomScrambleForEvent("333");

      update(ref(db, "rooms/" + roomId), {
        status: "playing",
        scramble: scramble
      });
    }

    if (sala.scramble) {
      scrambleEl.innerText = sala.scramble;
      cubePlayer.alg = sala.scramble;
    }

    let prontos = Object.values(players).filter(p => p.tempo !== null);

    if (prontos.length === 2) {
      let vencedor = prontos.sort((a, b) => a.tempo - b.tempo)[0];
      alert("🏆 Vencedor: " + vencedor.nome);
    }
  });
}

function entrarSalaInput() {
  const roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return alert("Digite o código da sala");
  entrarSala(roomId);
}

// ================== INIT ==================
novoScramble();
renderTempos();
atualizarStats();
carregarRanking();
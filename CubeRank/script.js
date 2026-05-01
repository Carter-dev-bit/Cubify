// ================== IMPORTS ==================
import { TwistyPlayer } from "https://cdn.cubing.net/js/cubing/twisty";
import { randomScrambleForEvent } from "https://cdn.cubing.net/js/cubing/scramble";

// ================== FIREBASE ==================
const db = window.db;
const ref = window.ref;
const push = window.push;
const onValue = window.onValue;

// ================== PLAYER ==================
let playerData = JSON.parse(localStorage.getItem("player")) || {
  id: crypto.randomUUID(),
  nome: "Player_" + Math.floor(Math.random() * 1000),
  avatar: "🧊"
};

localStorage.setItem("player", JSON.stringify(playerData));

// ================== TEMPOS (LOCAL STORAGE) ==================
let tempos = JSON.parse(localStorage.getItem("tempos")) || [];

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

    if (running) {
      pararTimer();
      return;
    }

    if (!inspecionando && !segurando) {
      iniciarInspecao();
      return;
    }

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

  // ================== SALVAR LOCAL ==================
  tempos.push(solve);
  localStorage.setItem("tempos", JSON.stringify(tempos));

  renderTempos();
  atualizarStats();

  // ================== FIREBASE ==================
  if (db) {
    // ranking global
    push(ref(db, "ranking"), {
      playerId: playerData.id,
      nome: playerData.nome,
      avatar: playerData.avatar,
      tempo: solve.tempo,
      dnf: solve.dnf,
      data: solve.data
    });

    // histórico do jogador
    push(ref(db, "solves/" + playerData.id), solve);
  }

  novoScramble();
}

function updateTimer() {
  let tempo = Date.now() - startTime;
  timerEl.innerText = (tempo / 1000).toFixed(2);
}

// ================== LISTA ==================
function renderTempos() {
  let lista = document.getElementById("listaTempos");
  lista.innerHTML = "";

  tempos.forEach(t => {
    let li = document.createElement("li");

    if (t.dnf) li.innerText = "DNF";
    else if (t.penalty === 2) li.innerText = t.tempo.toFixed(2) + " +2";
    else li.innerText = t.tempo.toFixed(2);

    lista.appendChild(li);
  });
}

// ================== STATS ==================
function atualizarStats() {
  if (tempos.length === 0) return;

  let validos = tempos.filter(t => !t.dnf);

  if (validos.length > 0) {
    let best = Math.min(...validos.map(t => t.tempo));
    document.getElementById("best").innerText = best.toFixed(2) + "s";

    let media = validos.reduce((a, b) => a + b.tempo, 0) / validos.length;
    document.getElementById("media").innerText = media.toFixed(2) + "s";
  }

  document.getElementById("total").innerText = tempos.length;

  if (tempos.length >= 5) {
    let ultimos = tempos.slice(-5).filter(t => !t.dnf);

    if (ultimos.length >= 3) {
      let valores = ultimos.map(t => t.tempo).sort((a, b) => a - b);
      valores.pop();
      valores.shift();

      let avg5 = valores.reduce((a, b) => a + b, 0) / valores.length;
      document.getElementById("avg5").innerText = avg5.toFixed(2) + "s";
    }
  }
}

// ================== RANKING ==================
function carregarRanking() {
  if (!db) return;

  const rankingRef = ref(db, "ranking");

  onValue(rankingRef, (snapshot) => {
    const data = snapshot.val();
    const lista = document.getElementById("ranking");

    lista.innerHTML = "";

    if (!data) return;

    let valores = Object.values(data)
      .filter(t => !t.dnf)
      .sort((a, b) => a.tempo - b.tempo)
      .slice(0, 10);

    valores.forEach((t, i) => {
      let li = document.createElement("li");
      li.innerText = `#${i+1} ${t.avatar || "🧊"} ${t.nome} - ${t.tempo.toFixed(2)}s`;
      lista.appendChild(li);
    });
  });
}

document.getElementById("btnPerfil").addEventListener("click", () => {
  window.location.href = "perfil.html";
});
// ================== INIT ==================
novoScramble();
renderTempos();
atualizarStats();
carregarRanking();
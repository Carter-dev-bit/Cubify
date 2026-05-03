// ================== IMPORTS ==================
import { TwistyPlayer } from "https://cdn.cubing.net/js/cubing/twisty";
import { randomScrambleForEvent } from "https://cdn.cubing.net/js/cubing/scramble";

// ================== FIREBASE ==================
const db = window.db;
const ref = window.ref;
const push = window.push;
const onValue = window.onValue;
const update = window.update;

// ================== PLAYER ==================
let playerData = JSON.parse(localStorage.getItem("player")) || {
  id: crypto.randomUUID(),
  nome: "Player_" + Math.floor(Math.random() * 1000),
  avatar: "🧊"
};

localStorage.setItem("player", JSON.stringify(playerData));

// ================== ELEMENTOS ==================
const timerEl = document.getElementById("timer");
const scrambleEl = document.getElementById("scramble");
const statusSala = document.getElementById("statusSala");
const area = document.getElementById("areaTimer");

// ================== CUBO ==================
const cubePlayer = new TwistyPlayer({
  puzzle: "3x3x3",
  alg: ""
});
document.getElementById("cubo").appendChild(cubePlayer);

// ================== ESTADO ==================
let startTime;
let interval;
let running = false;

let inspecionando = false;
let tempoInspecao = 15;
let intervaloInspecao;

let segurando = false;
let pronto = false;
let timeoutSegurar;

// ================== SCRAMBLE ==================
async function novoScramble() {
  const scramble = await randomScrambleForEvent("333");

  scrambleEl.innerText = scramble;
  cubePlayer.alg = scramble;
}

// ================== INSPEÇÃO ==================
function iniciarInspecao() {
  inspecionando = true;
  tempoInspecao = 15;

  timerEl.innerText = tempoInspecao;

  intervaloInspecao = setInterval(() => {
    tempoInspecao--;
    timerEl.innerText = tempoInspecao;

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
  interval = setInterval(() => {
    let tempo = Date.now() - startTime;
    timerEl.innerText = (tempo / 1000).toFixed(2);
  }, 10);

  running = true;
}

function pararTimer() {
  clearInterval(interval);
  running = false;

  const tempo = parseFloat(timerEl.innerText);

  const roomId = localStorage.getItem("roomId");

  if (roomId && db) {
    update(ref(db, `rooms/${roomId}/players/${playerData.id}`), {
      tempo: tempo
    });
  }

  novoScramble();
}

// ================== CONTROLE PC ==================
document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();

    if (running) return pararTimer();

    if (!inspecionando && !segurando) {
      iniciarInspecao();
      return;
    }

    if (inspecionando && !segurando) {
      segurando = true;

      timeoutSegurar = setTimeout(() => {
        pronto = true;
      }, 400);
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
  }
});

// ================== MOBILE ==================
let touchStart = 0;

area.addEventListener("touchstart", (e) => {
  e.preventDefault();

  if (running) {
    pararTimer();
    return;
  }

  touchStart = Date.now();

  if (!inspecionando) {
    iniciarInspecao();
  }

}, { passive: false });

area.addEventListener("touchend", (e) => {
  e.preventDefault();

  let tempoPressionado = Date.now() - touchStart;

  if (inspecionando && tempoPressionado > 400) {
    iniciarTimer();
  }

}, { passive: false });

// ================== SALAS ==================
function criarSala() {
  if (!db) return alert("Firebase não conectado");

  const salaRef = push(ref(db, "rooms"));

  update(salaRef, {
    host: playerData.id,
    status: "waiting",
    scramble: "",
    players: {
      [playerData.id]: {
        nome: playerData.nome,
        tempo: null
      }
    }
  });

  localStorage.setItem("roomId", salaRef.key);
  ouvirSala(salaRef.key);

  alert("Código da sala: " + salaRef.key);
}

function entrarSala() {
  const roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return alert("Digite o código");

  update(ref(db, `rooms/${roomId}/players/${playerData.id}`), {
    nome: playerData.nome,
    tempo: null
  });

  localStorage.setItem("roomId", roomId);

  statusSala.innerText = "🟡 Entrando na sala...";

  ouvirSala(roomId);
}

function ouvirSala(roomId) {

  onValue(ref(db, "rooms/" + roomId), async (snap) => {
    const sala = snap.val();
    if (!sala) return;

    const players = sala.players || {};
    const ids = Object.keys(players);

    // STATUS
    if (ids.length === 1) {
      statusSala.innerText = "🟡 Aguardando jogador...";
    }

    if (ids.length === 2 && sala.status === "waiting") {
      statusSala.innerText = "🔥 Jogador encontrado!";
    }

    if (sala.status === "playing") {
      statusSala.innerText = "🎮 Partida em andamento";
    }

    // INICIAR PARTIDA
    if (ids.length === 2 && sala.status === "waiting") {
      const scramble = await randomScrambleForEvent("333");

      update(ref(db, "rooms/" + roomId), {
        status: "playing",
        scramble: scramble
      });
    }

    // SCRAMBLE (só quando jogando)
    if (sala.status === "playing" && sala.scramble) {
      scrambleEl.innerText = sala.scramble;
      cubePlayer.alg = sala.scramble;
    }

    // RESULTADO (corrigido)
    const prontos = Object.values(players).filter(p => p.tempo !== null);

    if (prontos.length === 2 && sala.status === "playing") {
      let vencedor = prontos.sort((a, b) => a.tempo - b.tempo)[0];

      alert("🏆 " + vencedor.nome + " venceu!");

      // reset sala
      update(ref(db, "rooms/" + roomId), {
        status: "waiting",
        scramble: ""
      });

      Object.keys(players).forEach(id => {
        update(ref(db, `rooms/${roomId}/players/${id}`), {
          tempo: null
        });
      });
    }
  });
}

// ================== PERFIL ==================
document.getElementById("btnPerfil")?.addEventListener("click", () => {
  alert("Perfil em construção 🚧");
});

// ================== BOTÕES ==================
document.getElementById("btnCriarSala")?.addEventListener("click", criarSala);
document.getElementById("btnEntrarSala")?.addEventListener("click", entrarSala);

// ================== INIT ==================
novoScramble();
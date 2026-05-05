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
let unsubscribeSala = null;

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

  // SOLO → novo scramble
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

// ================== CONTROLES ==================
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

area.addEventListener("touchstart", (e) => {
  e.preventDefault();
  handlePressStart();
}, { passive: false });

area.addEventListener("touchend", (e) => {
  e.preventDefault();
  handlePressEnd();
}, { passive: false });

// ================== SALAS ==================
async function gerarCodigo() {
  let codigo;
  let existe = true;

  while (existe) {
    codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const snap = await get(ref(db, "rooms/" + codigo));
    existe = snap.exists();
  }

  return codigo;
}

// 🔥 CRIAR SALA (AGORA COM SCRAMBLE)
async function criarSala() {
  const roomId = await gerarCodigo();
  const scramble = await randomScrambleForEvent("333");

  await update(ref(db, "rooms/" + roomId), {
    host: playerData.id,
    scramble,
    players: {
      [playerData.id]: {
        nome: playerData.nome,
        tempo: null
      }
    }
  });

  salaAtualId = roomId;
  localStorage.setItem("roomId", roomId);

  ouvirSala(roomId); // 🔥 ESSENCIAL
  atualizarStatus("🟡 Aguardando jogador...");
}

// 🔥 ENTRAR SALA (COM LISTENER)
function entrarSala() {
  const roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return alert("Digite o código");

  update(ref(db, `rooms/${roomId}/players/${playerData.id}`), {
    nome: playerData.nome,
    tempo: null
  });

  salaAtualId = roomId;
  localStorage.setItem("roomId", roomId);

  ouvirSala(roomId); // 🔥 ESSENCIAL
  atualizarStatus("🔄 Entrando...");
}

function sairSala() {
  if (!salaAtualId) return;

  remove(ref(db, `rooms/${salaAtualId}/players/${playerData.id}`));
  localStorage.removeItem("roomId");
  salaAtualId = null;

  if (unsubscribeSala) unsubscribeSala();

  atualizarStatus("❌ Fora de sala");
}

// 🔥 OUVIR SALA (FIX REAL)
function ouvirSala(roomId) {

  if (unsubscribeSala) unsubscribeSala();

  unsubscribeSala = onValue(ref(db, "rooms/" + roomId), (snap) => {
    const sala = snap.val();
    if (!sala) return;

    const players = sala.players || {};
    const ids = Object.keys(players);

    const opponentId = ids.find(id => id !== playerData.id);

    // SCRAMBLE
    if (sala.scramble) {
      scrambleEl.innerText = sala.scramble;

      setTimeout(() => {
        cubePlayer.alg = sala.scramble;
      }, 50);
    }

    // STATUS
    if (ids.length === 1) atualizarStatus("🟡 Aguardando jogador...");
    if (ids.length === 2) atualizarStatus("🔥 Jogador encontrado!");

    // TEMPO OPONENTE
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

// ================== BOTÕES ==================
document.getElementById("btnCriarSala")?.addEventListener("click", criarSala);
document.getElementById("btnEntrarSala")?.addEventListener("click", entrarSala);
document.getElementById("btnSairSala")?.addEventListener("click", sairSala);
document.getElementById("btnCopiarSala")?.addEventListener("click", () => {
  if (!salaAtualId) return;
  navigator.clipboard.writeText(salaAtualId);
  alert("Código copiado!");
});

// ================== INIT ==================
if (salaAtualId) {
  ouvirSala(salaAtualId);
} else {
  novoScramble();
}
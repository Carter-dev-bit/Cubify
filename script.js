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
  avatar: "🧊"
};

localStorage.setItem("player", JSON.stringify(playerData));

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

let inspecionando = false;
let tempoInspecao = 15;
let intervaloInspecao;

// ================== CUBO ==================
const cubePlayer = new TwistyPlayer({
  puzzle: "3x3x3",
  alg: ""
});
document.getElementById("cubo").appendChild(cubePlayer);

// ================== STATUS UI ==================
function atualizarStatus(texto) {
  if (!salaAtualId) {
    statusSala.innerText = texto;
  } else {
    statusSala.innerText = `Sala: ${salaAtualId} | ${texto}`;
  }
}

// ================== SCRAMBLE ==================
async function novoScramble() {
  const scramble = await randomScrambleForEvent("333");
  scrambleEl.innerText = scramble;
  cubePlayer.alg = scramble;
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

  if (salaAtualId && db) {
    update(ref(db, `rooms/${salaAtualId}/players/${playerData.id}`), {
      tempo: tempo
    });
  }
}

// ================== CONTROLES ==================
document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();

    if (running) return pararTimer();

    if (!inspecionando) {
      inspecionando = true;
      tempoInspecao = 15;

      intervaloInspecao = setInterval(() => {
        tempoInspecao--;
        timerEl.innerText = tempoInspecao;

        if (tempoInspecao <= -2) {
          timerEl.innerText = "DNF";
          clearInterval(intervaloInspecao);
        }
      }, 1000);

      return;
    }

    iniciarTimer();
  }
});

// ================== GERAR CÓDIGO ==================
async function gerarCodigoUnico() {
  let codigo;
  let existe = true;

  while (existe) {
    codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const snap = await get(ref(db, "rooms/" + codigo));
    existe = snap.exists();
  }

  return codigo;
}

// ================== SALAS ==================
async function criarSala() {
  const roomId = await gerarCodigoUnico();

  await update(ref(db, "rooms/" + roomId), {
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

  salaAtualId = roomId;
  localStorage.setItem("roomId", roomId);

  ouvirSala(roomId);
  atualizarStatus("🟡 Aguardando jogador...");
}

function entrarSala() {
  const roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return alert("Digite o código");

  update(ref(db, `rooms/${roomId}/players/${playerData.id}`), {
    nome: playerData.nome,
    tempo: null
  });

  salaAtualId = roomId;
  localStorage.setItem("roomId", roomId);

  ouvirSala(roomId);
  atualizarStatus("🟡 Entrando...");
}

function sairSala() {
  if (!salaAtualId) return;

  remove(ref(db, `rooms/${salaAtualId}/players/${playerData.id}`));

  salaAtualId = null;
  localStorage.removeItem("roomId");

  atualizarStatus("❌ Saiu da sala");
}

// ================== COPIAR ==================
function copiarCodigo() {
  if (!salaAtualId) return;

  navigator.clipboard.writeText(salaAtualId);
  alert("Código copiado!");
}

// ================== OUVIR SALA ==================
function ouvirSala(roomId) {

  if (unsubscribeSala) unsubscribeSala();

  unsubscribeSala = onValue(ref(db, "rooms/" + roomId), async (snap) => {
    const sala = snap.val();
    if (!sala) return;

    const players = sala.players || {};
    const ids = Object.keys(players);

    if (ids.length === 1) {
      atualizarStatus("🟡 Aguardando jogador...");
    }

    if (ids.length === 2 && sala.status === "waiting") {
      atualizarStatus("🔥 Jogador encontrado!");
    }

    if (sala.status === "playing") {
      atualizarStatus("🎮 Partida em andamento");
    }

    // iniciar partida
    if (ids.length === 2 && sala.status === "waiting") {
      const scramble = await randomScrambleForEvent("333");

      update(ref(db, "rooms/" + roomId), {
        status: "playing",
        scramble: scramble
      });
    }

    // scramble
    if (sala.scramble) {
      scrambleEl.innerText = sala.scramble;
      cubePlayer.alg = sala.scramble;
    }

    // oponente
    const opponentId = ids.find(id => id !== playerData.id);

    if (opponentId && players[opponentId]) {
      const tempoOponente = players[opponentId].tempo;
      if (tempoOponente !== null) {
        timerOponenteEl.innerText = tempoOponente.toFixed(2);
      }
    }

    // resultado
    const prontos = Object.values(players).filter(p => p.tempo !== null);

    if (prontos.length === 2 && sala.status === "playing") {
      const vencedor = prontos.sort((a, b) => a.tempo - b.tempo)[0];

      atualizarStatus("🏆 " + vencedor.nome + " venceu!");

      update(ref(db, "rooms/" + roomId), {
        status: "waiting",
        scramble: ""
      });

      Object.keys(players).forEach(id => {
        update(ref(db, `rooms/${roomId}/players/${id}`), {
          tempo: null
        });
      });

      timerEl.innerText = "0.00";
      timerOponenteEl.innerText = "0.00";
    }
  });
}

// ================== RECONEXÃO ==================
if (salaAtualId) {
  ouvirSala(salaAtualId);
  atualizarStatus("🔄 Reconectado à sala");
}

// ================== BOTÕES ==================
document.getElementById("btnCriarSala")?.addEventListener("click", criarSala);
document.getElementById("btnEntrarSala")?.addEventListener("click", entrarSala);

// NOVOS BOTÕES (cria no HTML)
document.getElementById("btnSairSala")?.addEventListener("click", sairSala);
document.getElementById("btnCopiarSala")?.addEventListener("click", copiarCodigo);

// ================== INIT ==================
novoScramble();
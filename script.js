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

// ================== ELEMENTOS ==================
const timerEl = document.getElementById("timer");
const timerOponenteEl = document.getElementById("timerOponente");
const scrambleEl = document.getElementById("scramble");
const statusSala = document.getElementById("statusSala");

// ================== ESTADO ==================
let salaAtualId = localStorage.getItem("roomId") || null;
let unsubscribeSala = null;

let startTime;
let interval;
let running = false;

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
  cubePlayer.alg = scramble;
}

// ================== TIMER ==================
function iniciarTimer() {
  startTime = Date.now();
  interval = setInterval(() => {
    timerEl.innerText = ((Date.now() - startTime) / 1000).toFixed(2);
  }, 10);
  running = true;
}

function pararTimer() {
  clearInterval(interval);
  running = false;

  const tempo = parseFloat(timerEl.innerText);

  if (salaAtualId) {
    update(ref(db, `rooms/${salaAtualId}/players/${playerData.id}`), {
      tempo
    });
  }
}

// ================== CONTROLE ==================
document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    running ? pararTimer() : iniciarTimer();
  }
});

// ================== GERAR CÓDIGO NUMÉRICO ==================
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

// ================== SALAS ==================
async function criarSala() {
  const roomId = await gerarCodigo();

  await update(ref(db, "rooms/" + roomId), {
    host: playerData.id,
    status: "waiting",
    scramble: "",
    finished: false,
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
}

// ================== OUVIR SALA ==================
function ouvirSala(roomId) {

  if (unsubscribeSala) unsubscribeSala();

  unsubscribeSala = onValue(ref(db, "rooms/" + roomId), async (snap) => {
    const sala = snap.val();
    if (!sala) return;

    const players = sala.players || {};
    const ids = Object.keys(players);

    // STATUS
    if (ids.length === 1) atualizarStatus("🟡 Aguardando jogador...");
    if (ids.length === 2 && sala.status === "waiting") atualizarStatus("🔥 Jogador encontrado!");
    if (sala.status === "playing") atualizarStatus("🎮 Partida em andamento");

    // 🔥 SOMENTE HOST INICIA
    if (
      ids.length === 2 &&
      sala.status === "waiting" &&
      sala.host === playerData.id
    ) {
      const scramble = await randomScrambleForEvent("333");

      update(ref(db, "rooms/" + roomId), {
        status: "playing",
        scramble,
        finished: false
      });
    }

    // SCRAMBLE
    if (sala.scramble) {
      scrambleEl.innerText = sala.scramble;
      cubePlayer.alg = sala.scramble;
    }

    // OPONENTE
    const opponentId = ids.find(id => id !== playerData.id);

    if (opponentId && players[opponentId]?.tempo !== null) {
      timerOponenteEl.innerText = players[opponentId].tempo.toFixed(2);
    }

    // RESULTADO (ANTI LOOP)
    const prontos = Object.values(players).filter(p => p.tempo !== null);

    if (
      prontos.length === 2 &&
      sala.status === "playing" &&
      !sala.finished
    ) {
      const vencedor = prontos.sort((a, b) => a.tempo - b.tempo)[0];

      update(ref(db, "rooms/" + roomId), {
        finished: true
      });

      alert("🏆 " + vencedor.nome + " venceu!");
    }
  });
}

// ================== SAIR ==================
function sairSala() {
  if (!salaAtualId) return;

  remove(ref(db, `rooms/${salaAtualId}/players/${playerData.id}`));

  salaAtualId = null;
  localStorage.removeItem("roomId");

  atualizarStatus("Saiu da sala");
}

// ================== COPIAR ==================
function copiarCodigo() {
  if (!salaAtualId) return;

  navigator.clipboard.writeText(salaAtualId);
  alert("Código copiado!");
}

// ================== RECONEXÃO ==================
if (salaAtualId) {
  ouvirSala(salaAtualId);
  atualizarStatus("🔄 Reconectado");
}

// ================== BOTÕES ==================
document.getElementById("btnCriarSala")?.addEventListener("click", criarSala);
document.getElementById("btnEntrarSala")?.addEventListener("click", entrarSala);
document.getElementById("btnSairSala")?.addEventListener("click", sairSala);
document.getElementById("btnCopiarSala")?.addEventListener("click", copiarCodigo);

// ================== INIT ==================
novoScramble();
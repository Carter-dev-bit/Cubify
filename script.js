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

// ================== CUBO ==================
const cubePlayer = new TwistyPlayer({
  puzzle: "3x3x3",
  alg: ""
});
document.getElementById("cubo").appendChild(cubePlayer);

// ================== TIMER ==================
let startTime;
let interval;
let running = false;

async function novoScramble() {
  const scramble = await randomScrambleForEvent("333");
  scrambleEl.innerText = scramble;
  cubePlayer.alg = scramble;
}

function iniciarTimer() {
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

  // salva no firebase
  const roomId = localStorage.getItem("roomId");

  if (roomId && db) {
    update(ref(db, `rooms/${roomId}/players/${playerData.id}`), {
      tempo: tempo
    });
  }

  novoScramble();
}

// ================== CLICK / TOUCH ==================
const area = document.getElementById("areaTimer");

area.addEventListener("click", () => {
  if (!running) iniciarTimer();
  else pararTimer();
});

area.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (!running) iniciarTimer();
  else pararTimer();
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
  ouvirSala(roomId);
}

function ouvirSala(roomId) {
  onValue(ref(db, "rooms/" + roomId), async (snap) => {
    const sala = snap.val();
    if (!sala) return;

    const players = sala.players || {};
    const ids = Object.keys(players);

    // iniciar partida
    if (ids.length === 2 && sala.status === "waiting") {
      const scramble = await randomScrambleForEvent("333");

      update(ref(db, "rooms/" + roomId), {
        status: "playing",
        scramble: scramble
      });
    }

    // atualizar scramble
    if (sala.scramble) {
      scrambleEl.innerText = sala.scramble;
      cubePlayer.alg = sala.scramble;
    }

    // resultado
    const prontos = Object.values(players).filter(p => p.tempo !== null);

    if (prontos.length === 2) {
      const vencedor = prontos.sort((a, b) => a.tempo - b.tempo)[0];
      alert("🏆 " + vencedor.nome + " venceu!");
    }
  });
}

// ================== BOTÕES ==================
document.getElementById("btnCriarSala").addEventListener("click", criarSala);
document.getElementById("btnEntrarSala").addEventListener("click", entrarSala);

// ================== INIT ==================
novoScramble();
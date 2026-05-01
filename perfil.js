// pegar player
const player = JSON.parse(localStorage.getItem("player"));
const tempos = JSON.parse(localStorage.getItem("tempos")) || [];

// nome + avatar
document.getElementById("nome").innerText = player.nome;
document.getElementById("avatar").innerText = player.avatar;

// filtrar válidos
let validos = tempos.filter(t => !t.dnf);

// BEST
if (validos.length > 0) {
  let best = Math.min(...validos.map(t => t.tempo));
  document.getElementById("best").innerText = best.toFixed(2) + "s";
}

// MÉDIA
if (validos.length > 0) {
  let media = validos.reduce((a,b)=>a+b.tempo,0)/validos.length;
  document.getElementById("media").innerText = media.toFixed(2) + "s";
}

// AVG5
if (tempos.length >= 5) {
  let ultimos = tempos.slice(-5).filter(t => !t.dnf);

  if (ultimos.length >= 3) {
    let valores = ultimos.map(t=>t.tempo).sort((a,b)=>a-b);
    valores.pop();
    valores.shift();

    let avg5 = valores.reduce((a,b)=>a+b,0)/valores.length;
    document.getElementById("avg5").innerText = avg5.toFixed(2) + "s";
  }
}

// HISTÓRICO
let lista = document.getElementById("historico");

tempos.slice(-20).reverse().forEach(t => {
  let li = document.createElement("li");

  if (t.dnf) li.innerText = "DNF";
  else if (t.penalty === 2) li.innerText = t.tempo.toFixed(2) + " +2";
  else li.innerText = t.tempo.toFixed(2);

  lista.appendChild(li);
});

function voltar() {
  window.location.href = "cubify.html";
}
// ================== LOGIN ==================
let player = JSON.parse(localStorage.getItem("player"));

const loginScreen = document.getElementById("loginScreen");

if (player) {
  loginScreen.style.display = "none";
} else {
  document.querySelector(".app").style.display = "none";
}

window.entrar = function () {
  const nome = document.getElementById("loginNome").value.trim();
  const avatar = document.getElementById("avatar").value;

  if (!nome) {
    alert("Digite seu nome!");
    return;
  }

  player = {
    id: crypto.randomUUID(),
    nome,
    avatar
  };

  localStorage.setItem("player", JSON.stringify(player));

  location.reload();
};
async function consultarSessao() {
try {
const response = await fetch("/api/me", {
credentials: "same-origin",
});


    const user = response.ok ? await response.json() : null;

    const status = document.getElementById("status");

    status.textContent = user
        ? `Sessão de ${user.email ?? user.displayName}.`
        : "Nenhuma sessão neste navegador.";
} catch {
    const status = document.getElementById("status");

    status.textContent = "Não foi possível consultar a sessão.";
}


}

document.addEventListener("DOMContentLoaded", () => {
consultarSessao();
});

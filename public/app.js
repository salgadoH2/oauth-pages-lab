async function consultarSessao() {
    const status = document.getElementById("status");
    const card = document.getElementById("card-usuario");

    try {
        const response = await fetch("/api/me", {
            credentials: "same-origin",
        });

        const user = response.ok ? await response.json() : null;

        if (user) {
            const nome = user.displayName ?? user.email ?? "Proxy";
            const email = user.email ?? "—";
            const provedor = (user.provider ?? "desconhecido").toUpperCase();
            const id = user.id ?? "—";

            document.getElementById("usuario-nome").textContent = nome;
            document.getElementById("usuario-email").textContent = email;
            document.getElementById("usuario-conta").textContent = email;
            document.getElementById("usuario-provedor").textContent = provedor;
            document.getElementById("usuario-id").textContent = id;

            status.textContent = `Sessão de ${email}.`;
            card.hidden = false;
        } else {
            status.textContent = "Nenhuma sessão neste navegador.";
            card.hidden = true;
        }
    } catch {
        status.textContent = "Não foi possível consultar a sessão.";
        card.hidden = true;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    consultarSessao();
});

javascript
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

    const logoutForm = document.querySelector(
        "form[action=\"/oauth/logout\"]"
    );

    if (logoutForm) {
        logoutForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            try {
                const response = await fetch("/oauth/logout", {
                    method: "POST",
                    credentials: "same-origin",
                });

                if (response.ok || response.status === 204) {
                    window.location.reload();
                    return;
                }

                alert("Não foi possível encerrar a sessão.");
            } catch {
                alert("Erro ao tentar encerrar a sessão.");
            }
        });
    }
});


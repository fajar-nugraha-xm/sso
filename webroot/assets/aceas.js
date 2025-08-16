
import { callApi, log } from "/assets/common.js";

const kc = new Keycloak({
    url: "http://eservice.localhost/auth",
    realm: "agency-realm",
    clientId: "aceas-spa",
});

let token = null;


init();
async function init() {
    try {
        const auth = await kc.init({
            onLoad: "check-sso",
            checkLoginIframe: false,
            pkceMethod: "S256",
            redirectUri: window.location.origin + "/aceas/",
            scope: "openid profile email",
        });
        if (auth) {
            token = kc.token;
            log("out", "Authenticated.");
        } else {
            log("out", "Not authenticated.");
        }
    } catch (e) {
        console.error(e);
        log("out", "Init error: " + e);
    }
}

kc.onTokenExpired = async () => {
    try {
        await kc.updateToken(30);
        token = kc.token;
        log("out", "Token refreshed");
    } catch (e) {
        log("out", "Token refresh failed: " + e);
    }
};

document.getElementById("login").onclick = () => kc.login();
document.getElementById("logout").onclick = () =>
    kc.logout({ redirectUri: window.location.origin + "/aceas/" });
document.getElementById("userinfo").onclick = async () => {
    if (!kc.authenticated) return log("out", "Not logged in");
    const res = await fetch(
        "http://eservice.localhost/auth/realms/agency-realm/protocol/openid-connect/userinfo",
        { headers: { Authorization: "Bearer " + kc.token } }
    );
    log("out", "userinfo: " + JSON.stringify(await res.json(), null, 2));
};
document.getElementById("callapi").onclick = async () => {
    if (!kc.authenticated) return log("out", "Login first");
    const r = await callApi("/aceas/api/hello", kc.token);
    log("out", `ACEAS API [${r.status}]:\n${r.body}`);
};
document.getElementById("switch").onclick = () => {
    const go = encodeURIComponent("/cpds/");
    window.location.href = `/ids/auth/login?redirect=${go}`;
};
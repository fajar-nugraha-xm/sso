import '../styles/common.scss';
import { callApi, log, showLoading, hideLoading } from "../shared";
import Keycloak from 'keycloak-js';

const kc = new Keycloak({
    url: "http://eservice.localhost/auth",
    realm: "agency-realm",
    clientId: "aceas-spa",
});

let token = null;


init();
async function init() {
    // ensure loading overlay is visible while we decide
    showLoading();
    let isNeedToHide = false;
    try {
        const allqueries = (new URLSearchParams(window.location.search));
        let redirectUri = window.location.origin + "/aceas/";
        // append all query parameters to the redirect URI
        for (const [key, value] of allqueries) {
            redirectUri += `&${key}=${value}`;
        }
        redirectUri += window.location.hash ?? '';
        const auth = await kc.init({
            onLoad: "check-sso",
            checkLoginIframe: false,
            pkceMethod: "S256",
            redirectUri: redirectUri,
            scope: "openid profile email",
        });

        if (auth) {
            token = kc.token;
            log("out", "Authenticated.");

            isNeedToHide = true; // prevent hiding loading overlay
        } else {
            log("out", "Not authenticated: " + redirectUri);
            if (window.location.hash.includes("switcher")) {
                console.log("Switching");
                kc.login();
            } else {
                isNeedToHide = true; // prevent hiding loading overlay
            }
        }
    } catch (e) {
        console.error(e);
        log("out", "Init error: " + e);
    } finally {
        // hide loading overlay after auth check
        if (isNeedToHide) {
            hideLoading();
        }
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

document.getElementById("login").onclick = () => {
    console.log("Logging in...");
    kc.login();
};
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
    window.location.href = `/cpds/#switcher`;
};
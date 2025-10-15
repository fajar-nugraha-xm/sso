import './common.js';
import { signal, effect } from "@preact/signals";
import { callApi, log, showLoading, hideLoading } from "../shared/index.js";
import { oidc } from "./oidc.js";

const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const userInfoBtn = document.getElementById("userinfo");
const callApiBtn = document.getElementById("callapi");
const switchBtn = document.getElementById("switch");

const state = {
    isAuthenticated: signal(false),
    isLoading: signal(false),
    userInfo: signal(null),
};

async function validateTransferToken(hash) {
    try {
        // Extract token from hash (#switcher=token)
        const match = hash.match(/switcher=([^&]+)/);
        if (!match) return false;
        
        const tokenFromUrl = match[1];
        const storedToken = sessionStorage.getItem('app_transfer_token');
        const timestamp = parseInt(sessionStorage.getItem('app_transfer_timestamp') || '0');
        const source = sessionStorage.getItem('app_transfer_source');
        
        // Token must exist and match
        if (!storedToken || storedToken !== tokenFromUrl) {
            log("out", "Transfer token mismatch or missing");
            return false;
        }
        
        // Token must be from the correct source
        if (source !== 'cpds') {
            log("out", "Invalid transfer source");
            return false;
        }
        
        // Token must be recent (within 30 seconds)
        const now = Date.now();
        if (now - timestamp > 30000) {
            log("out", "Transfer token expired");
            return false;
        }
        
        return true;
    } catch (e) {
        console.error("Error validating transfer token:", e);
        return false;
    }
}

async function checkSSO() {
    // 1) local cache
    const cached = await oidc.getUser();
    if (cached && !cached.expired) {
        log("out", "Using cached user: " + JSON.stringify(cached, null, 2));
        return true;
    }

    // 2) silent (prompt=none) → sukses jika masih ada SSO cookie di keycloak
    try {
        const u = await oidc.signinSilent();
        log("out", "Silent signin success: " + JSON.stringify(u, null, 2));
        return !!u && !u.expired;
    } catch {
        return false;
    }
}

async function bootstrapAuth() {
    state.isLoading.value = true;
    try {
        // init handlers
        loginBtn.onclick = () => oidc.signinRedirect(); // sama dg kc.login()
        switchBtn.onclick = () => {
            // Generate a one-time transfer token for secure app switching
            const transferToken = crypto.randomUUID() + '-' + Date.now();
            sessionStorage.setItem('app_transfer_token', transferToken);
            sessionStorage.setItem('app_transfer_source', 'aceas');
            sessionStorage.setItem('app_transfer_timestamp', Date.now().toString());
            window.location.href = `/cpds/#switcher=${transferToken}`;
        };

        // “check-sso” dulu
        const ok = await checkSSO();
        state.isAuthenticated.value = ok;

        if (!ok) {
            log("out", "Not authenticated.");
            // jika datang dengan hash #switcher → validate transfer token
            if (window.location.hash.includes("switcher")) {
                const isValidTransfer = validateTransferToken(window.location.hash);
                if (!isValidTransfer) {
                    log("out", "Invalid or missing transfer token - login required");
                }
                // Always require login if not authenticated, regardless of token
                await oidc.signinRedirect();
                return;
            }
        } else {
            log("out", "Authenticated.");
            // Clear transfer token after successful authentication
            sessionStorage.removeItem('app_transfer_token');
            sessionStorage.removeItem('app_transfer_source');
            sessionStorage.removeItem('app_transfer_timestamp');
        }

        // token lifecycle (mirip kc.updateToken)
        oidc.events.addAccessTokenExpiring(async () => {
            try {
                await oidc.signinSilent(); log("out", "token expiring → silent renew");
                log("out", "silent renew success");
            } catch (error) {
                log("out", "silent renew error: " + error);
            }
        });
        oidc.events.addAccessTokenExpired(async () => {
            // coba renew; jika gagal, status jadi logged out
            try {
                await oidc.signinSilent(); 
                log("out", "token expired → silent renew");
            } catch (error) {
                log("out", "silent renew error: " + error);
                state.isAuthenticated.value = false;
            }
        });
        oidc.events.addUserSignedOut(async () => {
            // sesi di server berakhir
            await oidc.removeUser();
            state.isAuthenticated.value = false;
        });

    } catch (e) {
        console.error(e);
        log("out", "Init error: " + e);
        state.isAuthenticated.value = false;
    } finally {
        state.isLoading.value = false;
    }
}

effect(() => {
    // ui toggle
    const authed = state.isAuthenticated.value;
    loginBtn.style.display = authed ? "none" : "inline-block";
    logoutBtn.style.display = authed ? "inline-block" : "none";
    userInfoBtn.style.display = authed ? "inline-block" : "none";
    callApiBtn.style.display = authed ? "inline-block" : "none";

    if (authed) {
        if (!logoutBtn.onclick) {
            logoutBtn.onclick = async () => {
                try {
                    await oidc.signoutRedirect({ post_logout_redirect_uri: `${window.location.origin}/aceas/` });
                } finally {
                    await oidc.removeUser(); // local cleanup
                    state.isAuthenticated.value = false;
                }
            };
        }

        if (!userInfoBtn.onclick) {
            userInfoBtn.onclick = async () => {
                const u = await oidc.getUser();
                if (!u) 
                    return log("out", "Not logged in!");
                const res = await fetch(
                    "http://eservice.localhost/auth/realms/agency-realm/protocol/openid-connect/userinfo",
                    { headers: { Authorization: `Bearer ${u.access_token}` } }
                );
                const info = await res.json();
                state.userInfo.value = info;
                log("out", "userinfo: " + JSON.stringify(info, null, 2));
            };
        }

        if (!callApiBtn.onclick) {
            callApiBtn.onclick = async () => {
                const u = await oidc.getUser();
                if (!u) 
                    return log("out", "Login first");
                const r = await callApi("/aceas/api/hello", u.access_token);
                log("out", `ACEAS API [${r.status}]:\n${r.body}`);
            };
        }
    }
});

effect(() => state.isLoading.value ? showLoading() : hideLoading());

bootstrapAuth();

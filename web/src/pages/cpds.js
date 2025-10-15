import './common.js';
import { callApi, log, showLoading, hideLoading } from "../shared";

function validateTransferToken(hash) {
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
        if (source !== 'aceas') {
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

async function authCheck() {
    const r = await fetch("/ids/auth/refresh", {
        method: "POST",
        credentials: "include"
    });
    if (!r.ok) {
        window.localStorage.removeItem("access_token");
        window.localStorage.removeItem("refresh_token");
        window.localStorage.setItem("is_authenticated", "false");

        return false;
    } else {
        const { access_token, refresh_token } = await r.json();
        window.localStorage.setItem("access_token", access_token);
        window.localStorage.setItem("refresh_token", refresh_token);
        window.localStorage.setItem("is_authenticated", "true");

        return true;
    }
}
window.onload = async () => {
    // ensure loading overlay is visible while we decide
    showLoading();
    let isNeedToHide = false;
    try {
        const isAuth = await authCheck();
        if (!isAuth) {
            log("out", `State: not authenticated, please login`);
            if (window.location.hash.includes("switcher")) {
                // Validate transfer token
                const isValidTransfer = validateTransferToken(window.location.hash);
                if (isValidTransfer) {
                    log("out", "Valid transfer token detected - redirecting to login");
                } else {
                    log("out", "Invalid or missing transfer token - login required");
                }
                // keep overlay visible while redirecting
                location.href = '/ids/auth/login';
            } else {
                isNeedToHide = true; // prevent hiding loading overlay
            }

            return;
        }

        log("out", `Authenticated.`);
        // Clear transfer token after successful authentication
        sessionStorage.removeItem('app_transfer_token');
        sessionStorage.removeItem('app_transfer_source');
        sessionStorage.removeItem('app_transfer_timestamp');
        
        var interval = setInterval(async () => {
            const isAuth = await authCheck();
            if (!isAuth) {
                log("out", `State: not authenticated, clearing interval`);
                clearInterval(interval);
                return;
            }
        }, 60000); // Check every minute 
        
        isNeedToHide = true; // prevent hiding loading overlay
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

document.getElementById("login").onclick = () => {
    // show loading while redirecting to login
    showLoading();
    location.href = '/ids/auth/login';
};
document.getElementById("logout").onclick = () => {
    showLoading();
    location.href = '/ids/auth/logout';
};
document.getElementById("userinfo").onclick = async () => {
    const isAuthenticated = window.localStorage.getItem("is_authenticated") === "true" && window.localStorage.getItem("access_token");
    if (!isAuthenticated) return log("out", "Not logged in");

    const res = await fetch('/ids/me', {
        credentials: 'include',
        headers: { Authorization: "Bearer " + window.localStorage.getItem("access_token") }
    });

    log("out", "userinfo: " + JSON.stringify(await res.json(), null, 2));
};
document.getElementById("callapi").onclick = async () => {
    const isAuthenticated = window.localStorage.getItem("is_authenticated") === "true" && window.localStorage.getItem("access_token");
    if (!isAuthenticated) return log("out", "Not logged in");
    const r = await callApi("/cpds/api/hello", window.localStorage.getItem("access_token"));
    log("out", `CPDS API [${r.status}]:\n${r.body}`);
};
document.getElementById("switch").onclick = () => {
    // Generate a one-time transfer token for secure app switching
    const transferToken = crypto.randomUUID() + '-' + Date.now();
    sessionStorage.setItem('app_transfer_token', transferToken);
    sessionStorage.setItem('app_transfer_source', 'cpds');
    sessionStorage.setItem('app_transfer_timestamp', Date.now().toString());
    window.location.href = `/aceas/#switcher=${transferToken}`;
};
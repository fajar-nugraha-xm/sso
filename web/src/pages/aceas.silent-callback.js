import { log } from "../shared/index.js";
import { oidc } from "./oidc.js";

log("out", "Processing Silent callback...");
oidc.signinSilentCallback().then(() => {
    log("out", "Silent callback successful, redirecting...");
    window.location.replace("/aceas/");
});

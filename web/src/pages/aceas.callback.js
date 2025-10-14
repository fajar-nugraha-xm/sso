import { log } from "../shared/index.js";
import { oidc } from "./oidc.js";

log("out", "Processing callback...");
oidc.signinCallback().then(() => {
    log("out", "Callback successful, redirecting...");
    window.location.replace("/aceas/");
});

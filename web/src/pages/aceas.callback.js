import { oidc } from "./oidc.js";

console.log("Processing callback...");
oidc.signinCallback().then(() => {
    console.log("Callback successful, redirecting...");
    window.location.replace("/aceas/");
});

# Frontend-Only Authentication: Security Quick Reference

## Is Frontend-Only Authentication Safe and Secure?

**Yes, when done correctly!** This repository demonstrates secure frontend-only authentication using modern OAuth 2.0 best practices.

## Key Security Features (ACEAS App)

### ✅ What Makes It Secure

1. **PKCE (Proof Key for Code Exchange)**
   - SHA-256 code challenge/verifier
   - Prevents authorization code interception attacks
   - Required for public clients (SPAs)

2. **Authorization Code Flow**
   - NOT using deprecated Implicit Flow
   - Tokens never exposed in URL
   - Modern OAuth 2.0 standard

3. **Token Storage**
   - Keycloak.js stores tokens in memory by default
   - NOT using localStorage for access tokens
   - Session-scoped, cleared on tab close

4. **Backend Validation**
   - API validates every token using JWKS
   - Cryptographic signature verification
   - Never trusts tokens without validation

5. **Automatic Token Refresh**
   - Tokens refreshed before expiry
   - Maintains session continuity
   - Reduces exposure window

## Security Checklist

For secure frontend-only authentication:

- [x] PKCE enabled (S256)
- [x] Authorization Code Flow (not Implicit)
- [x] Tokens in memory/sessionStorage (not localStorage)
- [x] HTTPS in production
- [x] Backend validates tokens with JWKS
- [x] Tokens sent via Authorization header
- [x] Proper logout (clears server session)
- [x] Token refresh mechanism
- [ ] CSP headers configured (TODO)
- [x] No tokens in URL/query params
- [x] Keycloak client: publicClient=true
- [x] Implicit Flow disabled

## When to Use Frontend-Only vs Backend-Brokered

### Frontend-Only (ACEAS) ✅
- Simple applications
- Standard OpenID Connect claims sufficient
- Minimal backend complexity
- Standard token validation only

### Backend-Brokered (CPDS) ✅
- Custom token claims needed
- Multiple identity provider support
- Centralized token management
- Additional session control (revocation)

## Common Pitfalls to Avoid

❌ Using Implicit Flow (deprecated)  
❌ Storing tokens in localStorage  
❌ Not using PKCE  
❌ Sending tokens in URL parameters  
❌ Backend not validating tokens  
❌ No token refresh mechanism  
❌ Logging tokens to console  

## Implementation Examples

### Secure Initialization
```javascript
// web/src/pages/aceas.kc.js
await keycloak.init({
    onLoad: 'check-sso',
    checkLoginIframe: false,    // Prevent CSRF via iframe
    pkceMethod: 'S256',         // PKCE with SHA-256
    flow: 'standard',           // Authorization Code Flow
    redirectUri: window.location.href,
});
```

### Secure Token Transmission
```javascript
// Always use Authorization header
const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${token}` }
});
```

### Secure Backend Validation
```javascript
// services/aceas-api/index.js
const { payload } = await jwtVerify(token, JWKS, { 
    issuer: ISSUER, 
    audience: AUDIENCE,
    algorithms: ['RS256']  // Enforce strong algorithm
});
```

## References

- [OAuth 2.0 for Browser-Based Apps](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [PKCE Specification (RFC 7636)](https://datatracker.ietf.org/doc/html/rfc7636)
- [Keycloak JavaScript Adapter](https://www.keycloak.org/docs/latest/securing_apps/#_javascript_adapter)

For detailed security documentation in Indonesian, see [SECURITY.md](./SECURITY.md).

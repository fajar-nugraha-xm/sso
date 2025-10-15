# Security Guide: Frontend-Only Authentication

## Apakah Ada Approach yang Frontend Only Tapi Tetap Safe dan Secure?

**Ya, ada!** Repository ini mendemonstrasikan dua pendekatan autentikasi yang keduanya aman:

1. **Frontend-Only (App-1/ACEAS)** - Menggunakan Keycloak.js dengan PKCE
2. **Backend-Brokered (App-2/CPDS)** - Menggunakan backend IDS service

Keduanya memiliki keunggulan dan trade-off masing-masing.

---

## Pendekatan Frontend-Only yang Aman (ACEAS)

### Fitur Keamanan yang Diimplementasikan

#### 1. **PKCE (Proof Key for Code Exchange)**
```javascript
// web/src/pages/aceas.kc.js
await st.kc.init({
    onLoad: 'check-sso',
    checkLoginIframe: false,
    pkceMethod: 'S256',        // ✅ PKCE dengan SHA-256
    flow: 'standard',          // ✅ Authorization Code Flow
    redirectUri: window.location.href,
});
```

**Mengapa PKCE penting?**
- Melindungi dari authorization code interception attacks
- Wajib untuk public clients (SPA yang tidak bisa menyimpan client secret)
- Menggunakan SHA-256 hashing untuk keamanan tambahan

#### 2. **Authorization Code Flow (bukan Implicit Flow)**
```javascript
flow: 'standard'  // ✅ Authorization Code Flow
```

**Mengapa bukan Implicit Flow?**
- Implicit flow sudah deprecated untuk SPA
- Authorization Code Flow + PKCE adalah standar OAuth 2.0 modern
- Token tidak pernah terekspos di URL

#### 3. **Iframe Check Login Disabled**
```javascript
checkLoginIframe: false  // ✅ Menghindari CSRF via iframe
```

**Alasan:**
- Menghindari serangan CSRF melalui hidden iframe
- Lebih aman untuk SPA modern

#### 4. **Token Refresh Otomatis**
```javascript
st.kc.onTokenExpired = async () => {
    try {
        await st.kc.updateToken(30);  // ✅ Auto-refresh sebelum expire
        log("out", "Token refreshed");
    } catch (e) {
        log("out", "Token refresh failed: " + e);
    }
};
```

**Manfaat:**
- User tetap login tanpa harus login ulang
- Token selalu fresh dan valid
- Mengurangi risiko token expiry di tengah transaksi

#### 5. **Public Client Configuration**
```json
{
  "clientId": "aceas-spa",
  "publicClient": true,           // ✅ Tidak ada client secret
  "directAccessGrantsEnabled": false,  // ✅ Mencegah password flow
  "standardFlowEnabled": true,    // ✅ Hanya authorization code flow
  "implicitFlowEnabled": false    // ✅ Implicit flow disabled
}
```

**Konfigurasi keamanan:**
- `publicClient: true` - Sesuai dengan sifat SPA
- `directAccessGrantsEnabled: false` - Mencegah password flow yang tidak aman
- `implicitFlowEnabled: false` - Menonaktifkan flow yang deprecated

---

## Perbandingan: Frontend-Only vs Backend-Brokered

| Aspek | Frontend-Only (ACEAS) | Backend-Brokered (CPDS) |
|-------|----------------------|-------------------------|
| **Keamanan** | ✅ Aman dengan PKCE | ✅ Aman dengan backend validation |
| **Kompleksitas** | ⭐ Sederhana | ⭐⭐⭐ Kompleks |
| **Token Storage** | Browser (memory/sessionStorage) | Backend (httpOnly cookies) |
| **Token Exposure** | Client-side | Server-side |
| **Cross-App SSO** | ✅ Via Keycloak session | ✅ Via IDS service |
| **Token Customization** | ❌ Tidak bisa | ✅ Bisa (IDS mint custom token) |
| **Backend Required** | ❌ Tidak | ✅ Ya (IDS service) |
| **Best For** | Simple apps, standard claims | Complex apps, custom claims |

---

## Best Practices untuk Frontend-Only Authentication

### 1. **Token Storage**

**❌ JANGAN simpan di localStorage untuk access token:**
```javascript
// BURUK - vulnerable to XSS
localStorage.setItem('access_token', token);
```

**✅ GUNAKAN memory atau sessionStorage:**
```javascript
// BAIK - Keycloak.js handles this internally
// Token stored in memory by default
```

**Alasan:**
- localStorage accessible dari semua tabs dan persisten
- Lebih vulnerable terhadap XSS attacks
- sessionStorage lebih aman (tab-scoped, cleared on close)
- Memory storage paling aman (cleared on refresh)

### 2. **Token Transmission**

**✅ SELALU gunakan Authorization header:**
```javascript
const res = await fetch(apiUrl, {
    headers: { Authorization: "Bearer " + state.kc.token }
});
```

**❌ JANGAN kirim token via URL:**
```javascript
// BURUK - token exposed in logs, browser history
fetch(`${apiUrl}?token=${token}`);
```

### 3. **HTTPS Only**

**⚠️ WAJIB di production:**
```javascript
// Development: http://eservice.localhost
// Production: https://your-domain.com
```

**Tanpa HTTPS:**
- Token bisa di-intercept (man-in-the-middle)
- Semua security measures jadi tidak berguna

### 4. **Content Security Policy (CSP)**

**Tambahkan di HTML atau Nginx:**
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               connect-src 'self' https://your-keycloak.com;
               script-src 'self';">
```

**Manfaat:**
- Mencegah XSS attacks
- Membatasi sumber script yang bisa dijalankan
- Lapisan keamanan tambahan

### 5. **Token Validation di Backend**

**Backend API HARUS validate token:**
```javascript
// services/aceas-api/index.js
async function auth(req, res, next) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'No token' });
    
    // ✅ Validate with Keycloak's JWKS
    const { payload } = await jwtVerify(token, JWKS, { 
        issuer: ISSUER, 
        audience: AUDIENCE,
        algorithms: ['RS256']  // ✅ Enforce strong algorithm
    });
    
    req.jwt = payload;
    next();
}
```

**Jangan pernah:**
- Trust token blindly tanpa validasi
- Decode tanpa verify signature
- Accept weak algorithms (HS256 without secret rotation)

### 6. **Logout Properly**

**✅ Clear session di Keycloak:**
```javascript
state.kc.logout({ 
    redirectUri: window.location.origin + "/aceas/" 
});
```

**Juga clear local state:**
```javascript
// If you store anything locally
sessionStorage.clear();
state.userInfo.value = null;
state.isAuthenticated.value = false;
```

---

## Kapan Menggunakan Frontend-Only vs Backend-Brokered?

### Gunakan **Frontend-Only (ACEAS)** jika:

✅ Aplikasi relatif sederhana  
✅ Tidak perlu custom claims atau token transformation  
✅ Cukup dengan standard OpenID Connect claims  
✅ Ingin meminimalkan backend complexity  
✅ Backend API hanya perlu validasi token standard  

### Gunakan **Backend-Brokered (CPDS)** jika:

✅ Perlu custom token dengan claims tambahan  
✅ Perlu abstraction layer antara IdP dan aplikasi  
✅ Ingin centralized token management  
✅ Perlu support multiple identity providers  
✅ Perlu token dengan audience/issuer custom  
✅ Memerlukan additional session control (revocation, etc)  

---

## Common Security Pitfalls (Yang Harus Dihindari)

### ❌ 1. Menggunakan Implicit Flow
```javascript
// BURUK - deprecated dan tidak aman
flow: 'implicit'
```

### ❌ 2. Menyimpan Token di localStorage untuk Long-lived Tokens
```javascript
// BURUK - vulnerable to XSS
localStorage.setItem('access_token', token);
```

### ❌ 3. Tidak Menggunakan PKCE
```javascript
// BURUK - vulnerable to code interception
pkceMethod: undefined  // or not using PKCE
```

### ❌ 4. Mengekspos Token di Console/Logs
```javascript
// BURUK - token bisa dicuri dari console
console.log('Token:', token);
```

### ❌ 5. Tidak Menghandle Token Expiry
```javascript
// BURUK - no refresh logic, user tiba-tiba logged out
// Harus ada mechanism untuk refresh or re-authenticate
```

### ❌ 6. Skip Backend Validation
```javascript
// BURUK - backend trust token tanpa verify
app.get('/api/data', (req, res) => {
    const token = req.headers.authorization;
    const payload = JSON.parse(atob(token.split('.')[1]));  // ❌ DANGEROUS!
    // ... use payload without verification
});
```

---

## Security Checklist

Untuk implementasi frontend-only authentication yang aman:

- [ ] ✅ PKCE enabled (S256)
- [ ] ✅ Authorization Code Flow (bukan Implicit)
- [ ] ✅ Token di memory atau sessionStorage (bukan localStorage)
- [ ] ✅ HTTPS di production
- [ ] ✅ Backend validates token dengan JWKS
- [ ] ✅ Token sent via Authorization header
- [ ] ✅ Proper logout (clear Keycloak session)
- [ ] ✅ Token refresh mechanism
- [ ] ✅ CSP headers configured
- [ ] ✅ No token in URL/query params
- [ ] ✅ No token logged to console
- [ ] ✅ Keycloak client: publicClient=true, implicitFlow=false
- [ ] ✅ DirectAccessGrants disabled

---

## Kesimpulan

**Approach frontend-only BISA safe dan secure** jika:

1. ✅ Menggunakan **Authorization Code Flow + PKCE**
2. ✅ Token disimpan dengan **aman** (memory/sessionStorage)
3. ✅ Backend **validate token** properly
4. ✅ Menggunakan **HTTPS** di production
5. ✅ Follow **OAuth 2.0 best practices**

Repository ini (ACEAS app) sudah mengimplementasikan semua best practices di atas, sehingga **aman untuk production use** dengan beberapa enhancement tambahan seperti HTTPS dan CSP.

Untuk aplikasi yang lebih kompleks dengan kebutuhan custom token atau multiple IdP, pertimbangkan approach backend-brokered (CPDS).

---

## References

- [OAuth 2.0 for Browser-Based Apps (RFC)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [Keycloak JavaScript Adapter Documentation](https://www.keycloak.org/docs/latest/securing_apps/#_javascript_adapter)
- [PKCE (RFC 7636)](https://datatracker.ietf.org/doc/html/rfc7636)

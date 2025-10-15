# Pendekatan Pembatasan Perpindahan Aplikasi Melalui App Switcher

Dokumen ini menjelaskan berbagai pendekatan yang dapat diambil untuk membatasi perpindahan antar aplikasi (ACEAS dan CPDS) hanya melalui tombol app switcher, bukan melalui navigasi langsung ke URL.

## Konteks

Saat ini, sistem SSO playground memiliki dua aplikasi:
- **ACEAS** (App-1) - menggunakan Keycloak OIDC dengan oidc-client-ts
- **CPDS** (App-2) - menggunakan custom IDS provider

Kedua aplikasi memiliki tombol "switch" yang mengarahkan pengguna ke aplikasi lain dengan menambahkan hash `#switcher` pada URL:
- ACEAS: `switchBtn.onclick = () => { window.location.href = '/cpds/#switcher'; }`
- CPDS: `document.getElementById("switch").onclick = () => { window.location.href = '/aceas/#switcher'; }`

Hash `#switcher` digunakan untuk memicu auto-login jika pengguna belum terautentikasi.

---

## Pendekatan 1: Token/Nonce Sekali Pakai (Frontend + Backend)

### Deskripsi
Ketika tombol app switcher diklik, generate token/nonce unik yang disimpan di backend dan dikirim sebagai parameter URL. Aplikasi tujuan memvalidasi token tersebut dengan backend sebelum mengizinkan akses.

### Implementasi

#### 1.1 Di Aplikasi Sumber (ACEAS/CPDS)
```javascript
switchBtn.onclick = async () => {
    // Generate switching token
    const res = await fetch('/ids/generate-switch-token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            from: 'aceas',  // atau 'cpds'
            to: 'cpds',     // atau 'aceas'
            timestamp: Date.now()
        })
    });
    
    const { switchToken } = await res.json();
    window.location.href = `/cpds/?switch_token=${switchToken}`;
};
```

#### 1.2 Di Backend IDS (`services/ids/index.js`)
```javascript
// Store valid switch tokens (in-memory or Redis untuk production)
const switchTokens = new Map(); // token -> { from, to, createdAt, used }

app.post('/ids/generate-switch-token', authenticateUser, (req, res) => {
    const { from, to } = req.body;
    const token = randomUUID();
    
    switchTokens.set(token, {
        from,
        to,
        createdAt: Date.now(),
        used: false,
        userId: req.user.sub // dari session/JWT
    });
    
    // Auto-expire token setelah 30 detik
    setTimeout(() => switchTokens.delete(token), 30000);
    
    res.json({ switchToken: token });
});

app.post('/ids/validate-switch-token', (req, res) => {
    const { token, targetApp } = req.body;
    const entry = switchTokens.get(token);
    
    if (!entry || entry.used || entry.to !== targetApp) {
        return res.status(403).json({ valid: false, reason: 'Invalid or expired token' });
    }
    
    // Mark as used (single use)
    entry.used = true;
    
    res.json({ valid: true, userId: entry.userId });
});
```

#### 1.3 Di Aplikasi Tujuan (CPDS/ACEAS)
```javascript
window.onload = async () => {
    const params = new URLSearchParams(window.location.search);
    const switchToken = params.get('switch_token');
    
    if (switchToken) {
        // Validate token
        const res = await fetch('/ids/validate-switch-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: switchToken, targetApp: 'cpds' })
        });
        
        const { valid, reason } = await res.json();
        
        if (!valid) {
            log("out", `Unauthorized app switch: ${reason}`);
            // Redirect ke home atau block access
            window.location.href = '/';
            return;
        }
        
        // Lanjutkan dengan auth flow normal
        // Clean URL (remove token dari URL)
        window.history.replaceState({}, '', window.location.pathname);
    } else {
        // No switch token - validate user is not coming from direct URL navigation
        const referer = document.referrer;
        if (referer && !isAllowedReferer(referer)) {
            log("out", "Direct navigation not allowed. Please use app switcher.");
            // Block atau redirect
            return;
        }
    }
    
    // Continue normal auth flow...
};
```

### Kelebihan
- ✅ Keamanan tinggi - token hanya valid sekali dan terbatas waktu
- ✅ Backend dapat log semua perpindahan aplikasi
- ✅ Dapat track user behavior dan mencegah abuse
- ✅ Token tied to user session untuk validasi tambahan

### Kekurangan
- ❌ Membutuhkan backend endpoint baru
- ❌ Kompleksitas implementasi lebih tinggi
- ❌ Perlu session storage (in-memory atau Redis)
- ❌ Edge case: user bisa copy URL dengan token sebelum expire

### Rekomendasi
✅ **SANGAT DIREKOMENDASIKAN** untuk production environment dengan security requirements tinggi.

---

## Pendekatan 2: Session State Flag (Backend-Heavy)

### Deskripsi
Set flag di session backend ketika tombol app switcher diklik. Aplikasi tujuan cek flag tersebut saat load.

### Implementasi

#### 2.1 Di Aplikasi Sumber
```javascript
switchBtn.onclick = async () => {
    // Set flag di session
    await fetch('/ids/set-switching-flag', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetApp: 'cpds' })
    });
    
    window.location.href = '/cpds/#switcher';
};
```

#### 2.2 Di Backend IDS
```javascript
// Simpan di session atau in-memory store
const switchingFlags = new Map(); // sessionId -> { targetApp, timestamp }

app.post('/ids/set-switching-flag', authenticateUser, (req, res) => {
    const sessionId = req.session.id; // dari cookie session
    const { targetApp } = req.body;
    
    switchingFlags.set(sessionId, {
        targetApp,
        timestamp: Date.now()
    });
    
    // Auto-expire setelah 10 detik
    setTimeout(() => switchingFlags.delete(sessionId), 10000);
    
    res.json({ success: true });
});

app.get('/ids/check-switching-flag', authenticateUser, (req, res) => {
    const sessionId = req.session.id;
    const flag = switchingFlags.get(sessionId);
    
    if (flag && (Date.now() - flag.timestamp) < 10000) {
        // Clear flag setelah dipakai
        switchingFlags.delete(sessionId);
        res.json({ allowed: true, targetApp: flag.targetApp });
    } else {
        res.json({ allowed: false });
    }
});
```

#### 2.3 Di Aplikasi Tujuan
```javascript
window.onload = async () => {
    if (window.location.hash.includes("switcher")) {
        const res = await fetch('/ids/check-switching-flag', {
            credentials: 'include'
        });
        
        const { allowed } = await res.json();
        
        if (!allowed) {
            log("out", "Unauthorized access. Please use app switcher.");
            window.location.href = '/';
            return;
        }
    }
    
    // Continue normal flow...
};
```

### Kelebihan
- ✅ Tidak ada sensitive data di URL
- ✅ Backend control penuh
- ✅ Mudah di-audit

### Kekurangan
- ❌ Tight coupling dengan session management
- ❌ Timing issue jika network lambat
- ❌ Membutuhkan backend state management

### Rekomendasi
✅ Cocok untuk environment dengan session management yang robust.

---

## Pendekatan 3: Signed JWT Parameter (Frontend + Backend Validation)

### Deskripsi
Generate signed JWT yang berisi metadata perpindahan aplikasi. JWT ini di-sign oleh server dan divalidasi di aplikasi tujuan.

### Implementasi

#### 3.1 Di Aplikasi Sumber
```javascript
switchBtn.onclick = async () => {
    // Request signed switch token (JWT)
    const res = await fetch('/ids/create-switch-jwt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            from: 'aceas',
            to: 'cpds'
        })
    });
    
    const { switchJwt } = await res.json();
    window.location.href = `/cpds/?st=${switchJwt}`;
};
```

#### 3.2 Di Backend IDS
```javascript
import * as jose from 'jose';

app.post('/ids/create-switch-jwt', authenticateUser, async (req, res) => {
    const { from, to } = req.body;
    
    // Sign JWT dengan private key yang sama untuk app tokens
    const switchJwt = await new jose.SignJWT({
        type: 'app_switch',
        from,
        to,
        userId: req.user.sub,
        timestamp: Date.now()
    })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(config.issuer)
    .setExpirationTime('30s') // expire cepat
    .setJti(randomUUID())
    .sign(privateKey);
    
    res.json({ switchJwt });
});

app.post('/ids/verify-switch-jwt', async (req, res) => {
    const { switchJwt, targetApp } = req.body;
    
    try {
        const { payload } = await jose.jwtVerify(switchJwt, publicKey, {
            issuer: config.issuer
        });
        
        if (payload.type !== 'app_switch' || payload.to !== targetApp) {
            return res.status(403).json({ valid: false, reason: 'Invalid switch token' });
        }
        
        // Optional: check if JTI already used (prevent replay)
        if (usedJtis.has(payload.jti)) {
            return res.status(403).json({ valid: false, reason: 'Token already used' });
        }
        
        usedJtis.add(payload.jti);
        setTimeout(() => usedJtis.delete(payload.jti), 60000); // cleanup after 1 min
        
        res.json({ valid: true, userId: payload.userId });
    } catch (error) {
        res.status(403).json({ valid: false, reason: error.message });
    }
});
```

#### 3.3 Di Aplikasi Tujuan
```javascript
window.onload = async () => {
    const params = new URLSearchParams(window.location.search);
    const switchJwt = params.get('st');
    
    if (window.location.hash.includes("switcher") || switchJwt) {
        if (!switchJwt) {
            log("out", "Missing switch token. Please use app switcher.");
            window.location.href = '/';
            return;
        }
        
        const res = await fetch('/ids/verify-switch-jwt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ switchJwt, targetApp: 'cpds' })
        });
        
        const { valid, reason } = await res.json();
        
        if (!valid) {
            log("out", `Invalid switch: ${reason}`);
            window.location.href = '/';
            return;
        }
        
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
    }
    
    // Continue normal flow...
};
```

### Kelebihan
- ✅ Self-contained (JWT berisi semua info yang dibutuhkan)
- ✅ Cryptographically secure
- ✅ Tidak butuh backend state storage (kecuali untuk replay protection)
- ✅ Dapat include additional claims seperti permissions, role, etc.

### Kekurangan
- ❌ JWT di URL bisa panjang
- ❌ Perlu replay attack protection
- ❌ Slightly more complex implementation

### Rekomendasi
✅ **DIREKOMENDASIKAN** untuk balance antara security dan stateless architecture.

---

## Pendekatan 4: localStorage Coordination (Frontend-Only - TIDAK AMAN)

### Deskripsi
Set flag di localStorage ketika button diklik, lalu check di aplikasi tujuan.

### Implementasi

#### 4.1 Di Aplikasi Sumber
```javascript
switchBtn.onclick = () => {
    const switchToken = Date.now() + '-' + Math.random().toString(36);
    localStorage.setItem('app_switch_token', switchToken);
    localStorage.setItem('app_switch_timestamp', Date.now().toString());
    window.location.href = `/cpds/?st=${switchToken}`;
};
```

#### 4.2 Di Aplikasi Tujuan
```javascript
window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('st');
    const storedToken = localStorage.getItem('app_switch_token');
    const timestamp = parseInt(localStorage.getItem('app_switch_timestamp') || '0');
    
    // Check if switch token valid dan tidak expired (< 5 detik)
    if (urlToken && urlToken === storedToken && (Date.now() - timestamp) < 5000) {
        // Valid switch
        localStorage.removeItem('app_switch_token');
        localStorage.removeItem('app_switch_timestamp');
        window.history.replaceState({}, '', window.location.pathname);
    } else if (window.location.search.includes('st=')) {
        // Invalid or expired switch
        log("out", "Invalid app switch. Please use the switcher button.");
        window.location.href = '/';
        return;
    }
    
    // Continue normal flow...
};
```

### Kelebihan
- ✅ Simple, tidak butuh backend changes
- ✅ Fast implementation

### Kekurangan
- ❌ **SANGAT TIDAK AMAN** - user bisa manipulate localStorage via DevTools
- ❌ Mudah di-bypass
- ❌ Tidak ada server-side validation
- ❌ Token di URL tetap bisa di-copy

### Rekomendasi
❌ **TIDAK DIREKOMENDASIKAN** untuk production. Hanya untuk prototype atau demo.

---

## Pendekatan 5: Referer Header Validation (Frontend + Backend)

### Deskripsi
Validasi HTTP Referer header untuk memastikan request berasal dari halaman yang benar.

### Implementasi

#### 5.1 Di Backend (Middleware)
```javascript
function validateSwitchReferer(req, res, next) {
    const referer = req.get('Referer') || '';
    const targetPath = req.path;
    
    // Check if coming to /cpds/ or /aceas/
    if (targetPath.startsWith('/cpds/') || targetPath.startsWith('/aceas/')) {
        const allowedReferers = [
            'http://eservice.localhost/aceas/',
            'http://eservice.localhost/cpds/'
        ];
        
        const isValidReferer = allowedReferers.some(allowed => referer.startsWith(allowed));
        
        if (!isValidReferer && !req.session?.authenticated) {
            // Block direct access for unauthenticated users
            return res.status(403).send('Direct access not allowed');
        }
    }
    
    next();
}

app.use(validateSwitchReferer);
```

#### 5.2 Di Aplikasi Tujuan
```javascript
window.onload = async () => {
    // Additional client-side check
    const referer = document.referrer;
    const allowedReferers = [
        'http://eservice.localhost/aceas/',
        'http://eservice.localhost/cpds/'
    ];
    
    const isValidReferer = allowedReferers.some(allowed => referer.startsWith(allowed));
    
    if (!isValidReferer && window.location.hash.includes('switcher')) {
        log("out", "Please use the app switcher button.");
        window.location.href = '/';
        return;
    }
    
    // Continue...
};
```

### Kelebihan
- ✅ Simple implementation
- ✅ Menggunakan browser built-in mechanism

### Kekurangan
- ❌ **TIDAK RELIABEL** - Referer header bisa di-strip oleh browser, proxy, atau user settings
- ❌ Privacy policies mungkin block Referer
- ❌ Mudah di-spoof dengan tools
- ❌ Tidak bekerja jika user menggunakan HTTPS -> HTTP

### Rekomendasi
❌ **TIDAK DIREKOMENDASIKAN** sebagai sole security mechanism. Bisa digunakan sebagai additional layer.

---

## Pendekatan 6: Custom Header + CORS (Backend Validation)

### Deskripsi
Tambahkan custom header saat switch yang hanya bisa di-set oleh kode JavaScript dari origin yang sama.

### Implementasi

#### 6.1 Di Aplikasi Sumber
```javascript
switchBtn.onclick = async () => {
    try {
        // Pre-flight request dengan custom header
        const res = await fetch('/ids/initiate-switch', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-App-Switch': 'true',
                'X-Source-App': 'aceas',
                'X-Target-App': 'cpds'
            },
            body: JSON.stringify({ timestamp: Date.now() })
        });
        
        const { allowSwitch, token } = await res.json();
        
        if (allowSwitch) {
            window.location.href = `/cpds/?switch_id=${token}`;
        }
    } catch (error) {
        log("out", "Switch failed: " + error.message);
    }
};
```

#### 6.2 Di Backend IDS
```javascript
app.post('/ids/initiate-switch', authenticateUser, (req, res) => {
    const customHeader = req.get('X-App-Switch');
    const sourceApp = req.get('X-Source-App');
    const targetApp = req.get('X-Target-App');
    
    // Validate custom headers
    if (customHeader !== 'true' || !sourceApp || !targetApp) {
        return res.status(403).json({ 
            allowSwitch: false, 
            reason: 'Invalid switch request' 
        });
    }
    
    // Generate switch ID
    const switchId = randomUUID();
    switchTokens.set(switchId, {
        sourceApp,
        targetApp,
        userId: req.user.sub,
        timestamp: Date.now()
    });
    
    setTimeout(() => switchTokens.delete(switchId), 30000);
    
    res.json({ allowSwitch: true, token: switchId });
});

app.get('/ids/validate-switch/:switchId', authenticateUser, (req, res) => {
    const { switchId } = req.params;
    const entry = switchTokens.get(switchId);
    
    if (!entry || entry.userId !== req.user.sub) {
        return res.status(403).json({ valid: false });
    }
    
    switchTokens.delete(switchId); // Single use
    res.json({ valid: true, targetApp: entry.targetApp });
});
```

#### 6.3 Di Aplikasi Tujuan
```javascript
window.onload = async () => {
    const params = new URLSearchParams(window.location.search);
    const switchId = params.get('switch_id');
    
    if (switchId) {
        const res = await fetch(`/ids/validate-switch/${switchId}`, {
            credentials: 'include'
        });
        
        const { valid } = await res.json();
        
        if (!valid) {
            log("out", "Invalid switch. Please use app switcher.");
            window.location.href = '/';
            return;
        }
        
        window.history.replaceState({}, '', window.location.pathname);
    }
    
    // Continue...
};
```

### Kelebihan
- ✅ Custom headers tidak bisa di-set via simple link click
- ✅ CORS protection membantu validate origin
- ✅ Backend memiliki control penuh

### Kekurangan
- ❌ User masih bisa craft request dengan curl/Postman
- ❌ Membutuhkan authenticated session untuk validate
- ❌ Complex CORS configuration

### Rekomendasi
✅ Bisa dikombinasikan dengan approach lain untuk defense in depth.

---

## Pendekatan 7: Time-Based Window + IP/Session Validation

### Deskripsi
Kombinasi multiple checks: time window, IP address, session, dan user agent.

### Implementasi

#### 7.1 Di Backend IDS
```javascript
const switchRequests = new Map(); // userId -> { timestamp, ip, userAgent, targetApp }

app.post('/ids/request-switch', authenticateUser, (req, res) => {
    const userId = req.user.sub;
    const { targetApp } = req.body;
    
    switchRequests.set(userId, {
        timestamp: Date.now(),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        targetApp,
        sessionId: req.session.id
    });
    
    setTimeout(() => switchRequests.delete(userId), 5000); // 5 second window
    
    res.json({ success: true });
});

// Middleware untuk validasi switch
function validateSwitch(req, res, next) {
    const userId = req.user?.sub;
    
    if (!userId) {
        return next();
    }
    
    const switchReq = switchRequests.get(userId);
    
    if (switchReq) {
        const timeValid = (Date.now() - switchReq.timestamp) < 5000;
        const ipValid = switchReq.ip === req.ip;
        const uaValid = switchReq.userAgent === req.get('User-Agent');
        const sessionValid = switchReq.sessionId === req.session.id;
        
        if (timeValid && ipValid && uaValid && sessionValid) {
            // Valid switch
            switchRequests.delete(userId);
            req.validSwitch = true;
        }
    }
    
    next();
}
```

### Kelebihan
- ✅ Multiple layers of validation
- ✅ Harder to bypass
- ✅ Dapat detect suspicious behavior

### Kekurangan
- ❌ Complex implementation
- ❌ IP bisa berubah (mobile, load balancer)
- ❌ User Agent bisa di-spoof
- ❌ Tight time window bisa cause false negatives

### Rekomendasi
⚠️ Terlalu restrictive untuk kebanyakan use case. Hanya untuk high-security scenarios.

---

## Comparison Matrix

| Pendekatan | Security | Kompleksitas | Backend Required | Stateless | UX Impact | Production Ready |
|------------|----------|--------------|------------------|-----------|-----------|------------------|
| 1. Token Sekali Pakai | ⭐⭐⭐⭐⭐ | Medium | Yes | No | Minimal | ✅ Yes |
| 2. Session Flag | ⭐⭐⭐⭐ | Medium | Yes | No | Minimal | ✅ Yes |
| 3. Signed JWT | ⭐⭐⭐⭐⭐ | Medium-High | Yes | Mostly | Minimal | ✅ Yes |
| 4. localStorage | ⭐ | Low | No | Yes | Minimal | ❌ No |
| 5. Referer Header | ⭐⭐ | Low | Optional | Yes | None | ❌ No |
| 6. Custom Header | ⭐⭐⭐ | Medium | Yes | No | Minimal | ⚠️ Maybe |
| 7. Time-Based Multi | ⭐⭐⭐⭐ | High | Yes | No | Possible issues | ⚠️ Limited |

---

## Rekomendasi Final

### Untuk Production Environment
**Gunakan kombinasi Pendekatan #1 (Token Sekali Pakai) atau #3 (Signed JWT)**

Alasan:
- Security yang kuat dengan cryptographic validation
- Server-side control dan auditability
- User experience tidak terganggu
- Scalable dan maintainable

### Implementasi Bertahap

1. **Phase 1: Quick Win**
   - Implement Pendekatan #5 (Referer validation) sebagai first layer
   - Minimal code changes
   - Block obvious direct access attempts

2. **Phase 2: Proper Security**
   - Implement Pendekatan #1 atau #3
   - Add backend endpoints
   - Add client-side validation

3. **Phase 3: Defense in Depth**
   - Combine multiple approaches
   - Add monitoring dan logging
   - Add rate limiting untuk prevent abuse

### Considerations untuk SSO Playground Project

Mengingat ini adalah playground/demo project:
- Pendekatan #3 (Signed JWT) paling sesuai karena sudah ada JWT infrastructure
- Bisa reuse existing `services/ids/jwt.js` functions
- Demonstrasi security best practices
- Educational value tinggi

### Code Example - Recommended Implementation (Pendekatan #3)

Lihat implementasi detail di section Pendekatan #3 di atas. Key files yang perlu dimodifikasi:
1. `services/ids/index.js` - add switch JWT endpoints
2. `web/src/pages/aceas.js` - modify switchBtn.onclick
3. `web/src/pages/cpds.js` - add switch JWT validation di window.onload

---

## Security Notes

⚠️ **Important**: Tidak ada single solution yang 100% foolproof melawan determined attacker dengan developer tools access. Goal dari approaches ini adalah:

1. **Prevent casual/accidental direct navigation** - Block users yang copy-paste URL
2. **Make exploitation harder** - Increase effort required untuk bypass
3. **Enable monitoring** - Detect dan log suspicious behavior
4. **Provide audit trail** - Track app switching untuk compliance

Untuk truly restrict access, perlu dikombinasikan dengan:
- Rate limiting
- Anomaly detection
- Session monitoring
- User behavior analytics

---

## Additional Resources

- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [SPA Security Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)

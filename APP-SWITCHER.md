# App Switcher - Frontend-Only Validation

## Overview

Implementasi tombol app switcher dengan validasi frontend-only yang memastikan perpindahan aplikasi atau transfer login hanya boleh dilakukan melalui tombol tersebut. Jika pengguna langsung mengisi URL atau menggunakan bookmark, maka diwajibkan untuk login ulang.

## Mekanisme Keamanan

### 1. One-Time Transfer Token

Ketika pengguna mengklik tombol "Switch to ACEAS" atau "Switch to CPDS", sistem akan:

1. **Generate token unik** menggunakan `crypto.randomUUID()` + timestamp
2. **Simpan token di sessionStorage** bersama dengan:
   - `app_transfer_token`: Token unik
   - `app_transfer_source`: Aplikasi asal (aceas/cpds)
   - `app_transfer_timestamp`: Waktu pembuatan token
3. **Redirect dengan token di URL hash**: `#switcher={token}`

### 2. Validasi Token

Aplikasi tujuan akan memvalidasi token dengan kriteria:

- ✅ **Token harus ada dan cocok** dengan yang disimpan di sessionStorage
- ✅ **Sumber harus valid** (token dari ACEAS hanya valid untuk CPDS, vice versa)
- ✅ **Token harus fresh** (maksimal 30 detik sejak dibuat)
- ✅ **Token di-clear setelah digunakan**

### 3. Skenario Penggunaan

#### ✅ Skenario Valid - Via Button Switcher

```
User klik "Switch to CPDS" di ACEAS
  → Generate token: abc123-1234567890
  → Simpan di sessionStorage
  → Redirect ke /cpds/#switcher=abc123-1234567890
  → CPDS validasi token: ✅ VALID
  → User tetap authenticated (SSO)
```

#### ❌ Skenario Invalid - Direct URL/Bookmark

```
User ketik manual: http://eservice.localhost/cpds/
  → Tidak ada token di URL
  → Validasi token: ❌ GAGAL
  → User harus login ulang
```

#### ❌ Skenario Invalid - Token Expired

```
User klik switcher → generate token
  → Tunggu > 30 detik
  → Token expired
  → Validasi token: ❌ GAGAL
  → User harus login ulang
```

#### ❌ Skenario Invalid - Token Mismatch

```
User manipulasi URL hash
  → URL: /cpds/#switcher=invalid-token
  → Token tidak cocok dengan sessionStorage
  → Validasi token: ❌ GAGAL
  → User harus login ulang
```

## Implementation Details

### ACEAS App (aceas.js)

```javascript
// Generate transfer token saat klik switch button
switchBtn.onclick = () => {
    const transferToken = crypto.randomUUID() + '-' + Date.now();
    sessionStorage.setItem('app_transfer_token', transferToken);
    sessionStorage.setItem('app_transfer_source', 'aceas');
    sessionStorage.setItem('app_transfer_timestamp', Date.now().toString());
    window.location.href = `/cpds/#switcher=${transferToken}`;
};

// Validasi token saat bootstrap
function validateTransferToken(hash) {
    const match = hash.match(/switcher=([^&]+)/);
    if (!match) return false;
    
    const tokenFromUrl = match[1];
    const storedToken = sessionStorage.getItem('app_transfer_token');
    const timestamp = parseInt(sessionStorage.getItem('app_transfer_timestamp') || '0');
    const source = sessionStorage.getItem('app_transfer_source');
    
    // Validasi: token cocok, source valid, belum expired
    if (!storedToken || storedToken !== tokenFromUrl) return false;
    if (source !== 'cpds') return false;
    if (Date.now() - timestamp > 30000) return false;
    
    return true;
}
```

### CPDS App (cpds.js)

Implementasi serupa dengan ACEAS, dengan validasi source yang berkebalikan:

```javascript
// Validasi source harus 'aceas' untuk CPDS
if (source !== 'aceas') return false;
```

## Security Benefits

### 1. **Mencegah Bookmark Attack**
- User tidak bisa bookmark URL dengan hash `#switcher`
- Token akan expired dan tidak valid lagi

### 2. **Mencegah Direct URL Access**
- User yang langsung ketik URL tanpa melalui button harus login ulang
- Tidak ada token = tidak ada SSO transfer

### 3. **Mencegah Token Reuse**
- Token di-clear setelah digunakan
- Token hanya valid 30 detik
- One-time use only

### 4. **Mencegah Cross-Source Attack**
- Token dari ACEAS tidak valid untuk ACEAS
- Token dari CPDS tidak valid untuk CPDS
- Harus dari source yang berbeda

## Storage Strategy

### Mengapa sessionStorage?

✅ **sessionStorage digunakan untuk:**
- `app_transfer_token`
- `app_transfer_source`
- `app_transfer_timestamp`

**Keuntungan:**
- ✅ Tidak persisten (hilang saat tab ditutup)
- ✅ Terisolasi per-tab
- ✅ Tidak bisa diakses dari tab/window lain
- ✅ Auto-clear saat session berakhir

**Vs localStorage:**
- ❌ localStorage persisten dan accessible dari semua tabs
- ❌ Lebih rentan untuk attack vector
- ❌ Token bisa di-reuse dari tab lain

## Best Practices

### 1. Token Expiry

Token memiliki TTL 30 detik untuk keseimbangan antara UX dan security:
- ⏰ **30 detik**: Cukup untuk normal navigation
- 🔒 **Security**: Minimize window of opportunity untuk attack

### 2. Token Format

```
{uuid}-{timestamp}
contoh: 550e8400-e29b-41d4-a716-446655440000-1699999999999
```

- UUID untuk uniqueness
- Timestamp untuk validation

### 3. Cleanup

Token selalu di-clear setelah:
- ✅ Berhasil authenticated
- ✅ Failed validation
- ✅ Session ended

```javascript
sessionStorage.removeItem('app_transfer_token');
sessionStorage.removeItem('app_transfer_source');
sessionStorage.removeItem('app_transfer_timestamp');
```

## Testing Scenarios

### Test 1: Valid Switch
1. Login ke ACEAS
2. Klik "Switch to CPDS"
3. ✅ Expected: Langsung masuk CPDS tanpa login ulang

### Test 2: Invalid Direct Access
1. Login ke ACEAS
2. Buka tab baru, ketik: `http://eservice.localhost/cpds/`
3. ❌ Expected: Harus login ulang

### Test 3: Bookmark Test
1. Login ke ACEAS
2. Klik "Switch to CPDS"
3. Bookmark halaman CPDS (dengan hash #switcher)
4. Logout
5. Klik bookmark
6. ❌ Expected: Harus login ulang (token expired/invalid)

### Test 4: Token Expired
1. Login ke ACEAS
2. Klik "Switch to CPDS" tapi jangan load page
3. Tunggu 31 detik
4. Load page
5. ❌ Expected: Token expired, harus login ulang

### Test 5: Token Manipulation
1. Login ke ACEAS
2. Klik "Switch to CPDS"
3. Edit URL hash di browser: `#switcher=fake-token`
4. ❌ Expected: Token mismatch, harus login ulang

## Limitations

### 1. Frontend-Only

⚠️ Ini adalah validasi **frontend-only**, artinya:
- Bisa di-bypass oleh developer tools
- Tidak cocok untuk high-security requirements
- Hanya melindungi dari casual users

### 2. Not Cryptographically Secure

⚠️ Token tidak dienkripsi:
- Token plaintext di sessionStorage
- Token visible di URL hash
- Suitable untuk UX improvement, bukan security-critical

### 3. Browser Compatibility

⚠️ Memerlukan:
- `crypto.randomUUID()` (modern browsers)
- `sessionStorage` support
- Modern JavaScript features

## Alternative Approaches

Untuk security yang lebih tinggi, pertimbangkan:

### Backend-Validated Approach
- Token di-generate dan di-validate di backend
- Token di-sign dengan cryptographic key
- Token stored di httpOnly cookies
- Lebih aman tapi lebih kompleks

### Session-Based Approach
- Gunakan backend session tracking
- No token exposure di frontend
- Full server-side validation
- Memerlukan backend changes

## Kesimpulan

Implementasi app switcher dengan frontend-only validation ini:

✅ **Cocok untuk:**
- UX improvement
- Mendorong user pakai button switcher
- Proteksi casual bookmark/direct URL

❌ **Tidak cocok untuk:**
- Security-critical applications
- High-security requirements
- Preventing determined attackers

Untuk most use cases di SSO playground ini, approach ini **sufficient dan balance** antara security, UX, dan complexity.

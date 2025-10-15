# App Switcher Flow Diagram

## Valid Switch Flow (ACEAS → CPDS)

```
┌─────────────────────────────────────────────────────────────────┐
│ User clicks "Switch to CPDS" button in ACEAS                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Generate Transfer Token                                         │
│ • token = crypto.randomUUID() + '-' + Date.now()                │
│ • Store in sessionStorage:                                      │
│   - app_transfer_token = token                                  │
│   - app_transfer_source = 'aceas'                               │
│   - app_transfer_timestamp = Date.now()                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Redirect to: /cpds/#switcher={token}                            │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ CPDS Page Loads - Validate Token                                │
│ 1. Extract token from URL hash                                  │
│ 2. Get stored token from sessionStorage                         │
│ 3. Validate:                                                    │
│    ✓ Token matches                                              │
│    ✓ Source is 'aceas' (correct origin)                         │
│    ✓ Token age < 30 seconds                                     │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
    ┌──────────┐         ┌──────────┐
    │  Valid   │         │ Invalid  │
    │  Token   │         │  Token   │
    └─────┬────┘         └─────┬────┘
          │                    │
          ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│ Check SSO:       │  │ Log error msg:   │
│ • Silent login   │  │ • Token mismatch │
│ • Reuse Keycloak │  │ • Wrong source   │
│   session        │  │ • Expired        │
│ • Auto login ✓   │  │ Force login ✗    │
└────────┬─────────┘  └──────────────────┘
         │
         ▼
┌──────────────────┐
│ Clear tokens:    │
│ • Remove token   │
│ • Remove source  │
│ • Remove tstamp  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ User logged in   │
│ to CPDS via SSO  │
└──────────────────┘
```

## Invalid Switch Flow (Direct URL/Bookmark)

```
┌─────────────────────────────────────────────────────────────────┐
│ User types URL directly or uses bookmark                        │
│ URL: http://eservice.localhost/cpds/                            │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ CPDS Page Loads                                                 │
│ • No #switcher hash in URL                                      │
│ • No transfer token in sessionStorage                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Check Authentication                                            │
│ • Call /ids/auth/refresh                                        │
│ • No valid session                                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Result: Not Authenticated                                       │
│ • Log: "State: not authenticated, please login"                 │
│ • Show login button                                             │
│ • NO automatic SSO transfer                                     │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ User must manually click "Login" button                         │
│ Then complete full login flow                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Token Lifecycle

```
┌────────────┐
│  Created   │  ← Button clicked
└─────┬──────┘
      │ Age: 0s
      ▼
┌────────────┐
│   Valid    │  ← Can be used for SSO transfer
│ (0-30s)    │
└─────┬──────┘
      │ Age: 30s
      ▼
┌────────────┐
│  Expired   │  ← Too old, must re-login
│  (>30s)    │
└─────┬──────┘
      │ Age: varies
      ▼
┌────────────┐
│  Consumed  │  ← Cleared after successful use
│ (removed)  │
└────────────┘
```

## Security Validation Matrix

```
┌─────────────────────┬──────────┬──────────┬─────────────────┐
│ Condition           │ Token    │ Source   │ Timestamp       │
├─────────────────────┼──────────┼──────────┼─────────────────┤
│ ✅ Valid Switch     │ Matches  │ Correct  │ < 30s           │
├─────────────────────┼──────────┼──────────┼─────────────────┤
│ ❌ Direct URL       │ Missing  │ N/A      │ N/A             │
├─────────────────────┼──────────┼──────────┼─────────────────┤
│ ❌ Bookmark         │ Mismatch │ N/A      │ N/A (consumed)  │
├─────────────────────┼──────────┼──────────┼─────────────────┤
│ ❌ Expired          │ Matches  │ Correct  │ > 30s           │
├─────────────────────┼──────────┼──────────┼─────────────────┤
│ ❌ Wrong Source     │ Matches  │ Incorrect│ < 30s           │
├─────────────────────┼──────────┼──────────┼─────────────────┤
│ ❌ Manipulated      │ Mismatch │ Any      │ Any             │
└─────────────────────┴──────────┴──────────┴─────────────────┘
```

## Token Storage: sessionStorage vs localStorage

```
┌─────────────────────────────────────────────────────────────────┐
│ sessionStorage (Used in this implementation)                    │
├─────────────────────────────────────────────────────────────────┤
│ ✅ Tab-scoped (isolated per tab)                                │
│ ✅ Cleared when tab closes                                      │
│ ✅ Not accessible from other tabs                               │
│ ✅ More secure for temporary tokens                             │
│ ✅ Cannot persist across browser restarts                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ localStorage (NOT used - less secure)                           │
├─────────────────────────────────────────────────────────────────┤
│ ❌ Shared across all tabs                                       │
│ ❌ Persists even after browser closes                           │
│ ❌ Accessible from any tab/window                               │
│ ❌ More vulnerable to XSS attacks                               │
│ ❌ Can be misused for token reuse                               │
└─────────────────────────────────────────────────────────────────┘
```

## Code Flow - ACEAS Switch Button

```javascript
// 1. User clicks "Switch to CPDS"
switchBtn.onclick = () => {
    
    // 2. Generate unique token
    const transferToken = crypto.randomUUID() + '-' + Date.now();
    //    Example: "550e8400-e29b-41d4-a716-446655440000-1699999999999"
    
    // 3. Store token metadata
    sessionStorage.setItem('app_transfer_token', transferToken);
    sessionStorage.setItem('app_transfer_source', 'aceas');
    sessionStorage.setItem('app_transfer_timestamp', Date.now().toString());
    
    // 4. Redirect with token in hash
    window.location.href = `/cpds/#switcher=${transferToken}`;
};
```

## Code Flow - CPDS Token Validation

```javascript
// 1. Extract token from URL
const hash = window.location.hash; // "#switcher={token}"
const match = hash.match(/switcher=([^&]+)/);
const tokenFromUrl = match[1];

// 2. Get stored token
const storedToken = sessionStorage.getItem('app_transfer_token');
const timestamp = parseInt(sessionStorage.getItem('app_transfer_timestamp'));
const source = sessionStorage.getItem('app_transfer_source');

// 3. Validate conditions
if (storedToken !== tokenFromUrl) return false;      // Mismatch
if (source !== 'aceas') return false;                // Wrong source
if (Date.now() - timestamp > 30000) return false;    // Expired

// 4. If valid, allow SSO transfer
// 5. Clear tokens after use
sessionStorage.removeItem('app_transfer_token');
sessionStorage.removeItem('app_transfer_source');
sessionStorage.removeItem('app_transfer_timestamp');
```

## Attack Prevention

```
┌─────────────────────────────────────────────────────────────────┐
│ Attack Vector              │ Prevention                         │
├────────────────────────────┼────────────────────────────────────┤
│ 🚫 Bookmark Reuse          │ Token consumed after first use     │
│ 🚫 Direct URL              │ No token = no SSO transfer         │
│ 🚫 Token Replay            │ One-time use, cleared after use    │
│ 🚫 Token Theft             │ Tab-scoped sessionStorage          │
│ 🚫 Stale Tokens            │ 30-second TTL                      │
│ 🚫 Cross-App Tokens        │ Source validation                  │
│ 🚫 Token Manipulation      │ Token match validation             │
│ 🚫 Timing Attacks          │ Timestamp validation               │
└────────────────────────────┴────────────────────────────────────┘
```

## Complete Example Scenario

```
Timeline: Successful ACEAS → CPDS Switch

00:00.000  User authenticated in ACEAS
           sessionStorage: (empty)

00:05.123  User clicks "Switch to CPDS"
           Generate token: "abc123...-1710000000123"
           
           sessionStorage:
           {
             app_transfer_token: "abc123...-1710000000123",
             app_transfer_source: "aceas",
             app_transfer_timestamp: "1710000000123"
           }

00:05.150  Redirect to: /cpds/#switcher=abc123...-1710000000123

00:05.500  CPDS page loads
           Extract token from URL: "abc123...-1710000000123"
           Get from sessionStorage: "abc123...-1710000000123"
           
           Validate:
           ✓ Token matches: YES
           ✓ Source is 'aceas': YES
           ✓ Age (377ms) < 30s: YES
           
           Validation: PASS

00:05.600  Attempt silent SSO
           Keycloak session exists
           Auto-login: SUCCESS

00:05.700  Clear tokens
           sessionStorage: (empty)
           
00:05.800  User logged into CPDS
           Token consumed, cannot reuse
```

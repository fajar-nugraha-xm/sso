# Test Plan: App Switcher with Frontend-Only Validation

## Prerequisites

1. Docker and Docker Compose installed
2. Host entry for `eservice.localhost` pointing to `127.0.0.1`
3. Run `make up` to start the stack

## Test Cases

### Test Case 1: Valid App Switch (ACEAS → CPDS)

**Objective**: Verify that clicking the switch button allows seamless SSO transfer

**Steps**:
1. Navigate to `http://eservice.localhost/aceas/`
2. Click "Login" button
3. Login with credentials: `demo` / `demo123`
4. Verify you are authenticated in ACEAS
5. Click "Switch to CPDS" button
6. Wait for redirect to complete

**Expected Result**:
- ✅ Should redirect to CPDS with hash `#switcher={token}` in URL
- ✅ Should automatically authenticate without showing login page
- ✅ CPDS page should show "Authenticated." message
- ✅ Token should be cleared from sessionStorage after authentication
- ✅ Hash should remain in URL but token is consumed

**Validation**:
```javascript
// In browser console before switch:
sessionStorage.getItem('app_transfer_token') // should be null

// After clicking "Switch to CPDS" but before page loads:
sessionStorage.getItem('app_transfer_token') // should show token
sessionStorage.getItem('app_transfer_source') // should be 'aceas'
sessionStorage.getItem('app_transfer_timestamp') // should show timestamp

// After CPDS loads and authenticates:
sessionStorage.getItem('app_transfer_token') // should be null (cleared)
```

---

### Test Case 2: Valid App Switch (CPDS → ACEAS)

**Objective**: Verify reverse direction switch works

**Steps**:
1. Navigate to `http://eservice.localhost/cpds/`
2. Click "Login" button
3. Login with credentials: `demo` / `demo123`
4. Verify you are authenticated in CPDS
5. Click "Switch to ACEAS" button
6. Wait for redirect to complete

**Expected Result**:
- ✅ Should redirect to ACEAS with hash `#switcher={token}` in URL
- ✅ Should automatically authenticate without showing login page
- ✅ ACEAS page should show "Authenticated." message
- ✅ Token should be cleared from sessionStorage

---

### Test Case 3: Invalid - Direct URL Access (No Token)

**Objective**: Verify that direct URL access requires re-login

**Steps**:
1. Navigate to `http://eservice.localhost/aceas/`
2. Login with credentials: `demo` / `demo123`
3. Open a new tab/window
4. Type directly in address bar: `http://eservice.localhost/cpds/`
5. Press Enter

**Expected Result**:
- ❌ Should NOT be automatically authenticated
- ❌ Should show "State: not authenticated, please login" message
- ❌ Should require clicking "Login" button
- ❌ Login page should appear (no SSO transfer)

**Why**: No transfer token was generated, so SSO transfer is not allowed

---

### Test Case 4: Invalid - Bookmark Access

**Objective**: Verify bookmarked URLs with old tokens don't work

**Steps**:
1. Navigate to `http://eservice.localhost/aceas/`
2. Login with credentials: `demo` / `demo123`
3. Click "Switch to CPDS" button
4. After CPDS loads, bookmark the page (Ctrl+D / Cmd+D)
   - Bookmark URL will be: `http://eservice.localhost/cpds/#switcher={old-token}`
5. Logout from CPDS
6. Close the browser tab
7. Open bookmark from bookmark bar

**Expected Result**:
- ❌ Should NOT be automatically authenticated
- ❌ Should show "Invalid or missing transfer token - login required"
- ❌ Should show login page
- ❌ Token in URL is old/expired/consumed

**Why**: Token was already consumed and cleared from sessionStorage

---

### Test Case 5: Invalid - Token Expired

**Objective**: Verify that tokens expire after 30 seconds

**Steps**:
1. Navigate to `http://eservice.localhost/aceas/`
2. Login with credentials: `demo` / `demo123`
3. Click "Switch to CPDS" button
4. **IMMEDIATELY** prevent page from loading (press Esc key quickly)
5. Wait 35 seconds
6. Refresh the page or navigate to the URL again

**Expected Result**:
- ❌ Should show "Transfer token expired" message
- ❌ Should require re-login
- ❌ No automatic SSO transfer

**Why**: Token TTL is 30 seconds

---

### Test Case 6: Invalid - Token Manipulation

**Objective**: Verify that manipulated tokens are rejected

**Steps**:
1. Navigate to `http://eservice.localhost/aceas/`
2. Login with credentials: `demo` / `demo123`
3. Click "Switch to CPDS" button
4. **Before page loads**, open browser console
5. Execute: `sessionStorage.setItem('app_transfer_token', 'fake-token-123')`
6. Let page finish loading

**Expected Result**:
- ❌ Should show "Transfer token mismatch or missing" message
- ❌ Token in URL doesn't match token in sessionStorage
- ❌ Should require re-login

---

### Test Case 7: Invalid - Wrong Source

**Objective**: Verify that tokens from wrong source are rejected

**Steps**:
1. Navigate to `http://eservice.localhost/aceas/`
2. Login with credentials: `demo` / `demo123`
3. Open browser console
4. Execute:
   ```javascript
   sessionStorage.setItem('app_transfer_token', crypto.randomUUID() + '-' + Date.now());
   sessionStorage.setItem('app_transfer_source', 'aceas'); // Wrong source!
   sessionStorage.setItem('app_transfer_timestamp', Date.now().toString());
   ```
5. Navigate to: `http://eservice.localhost/aceas/#switcher={the-token}`

**Expected Result**:
- ❌ Should show "Invalid transfer source" message
- ❌ Token source is 'aceas' but target is also ACEAS (should be from 'cpds')
- ❌ Should require re-login

---

### Test Case 8: Token Cleanup After Success

**Objective**: Verify tokens are properly cleaned up

**Steps**:
1. Navigate to `http://eservice.localhost/aceas/`
2. Login with credentials: `demo` / `demo123`
3. Open browser console
4. Click "Switch to CPDS" button
5. After CPDS loads and authenticates, check console:
   ```javascript
   sessionStorage.getItem('app_transfer_token')
   sessionStorage.getItem('app_transfer_source')
   sessionStorage.getItem('app_transfer_timestamp')
   ```

**Expected Result**:
- ✅ All three values should be `null`
- ✅ Tokens are cleaned up after successful use
- ✅ Cannot reuse the same token

---

### Test Case 9: Multiple Rapid Switches

**Objective**: Verify system handles rapid switching correctly

**Steps**:
1. Navigate to `http://eservice.localhost/aceas/`
2. Login with credentials: `demo` / `demo123`
3. Click "Switch to CPDS"
4. Wait for CPDS to load and authenticate
5. Immediately click "Switch to ACEAS"
6. Wait for ACEAS to load and authenticate
7. Repeat steps 3-6 several times quickly

**Expected Result**:
- ✅ Each switch should work correctly
- ✅ New token generated each time
- ✅ Old tokens properly cleaned up
- ✅ No token collision or conflicts
- ✅ SSO works for each switch

---

### Test Case 10: Token in URL Hash Persistence

**Objective**: Verify that hash with token persists but is ineffective

**Steps**:
1. Navigate to `http://eservice.localhost/aceas/`
2. Login with credentials: `demo` / `demo123`
3. Click "Switch to CPDS"
4. After CPDS loads, note the URL has hash: `#switcher={token}`
5. Refresh the page (F5)

**Expected Result**:
- ❌ Hash remains in URL but token is already consumed
- ❌ Should show "Transfer token mismatch or missing" if not authenticated
- ✅ If already authenticated, should stay authenticated via normal SSO
- ❌ Hash token is NOT reusable

---

## Browser Console Debugging

Use these console commands to inspect token state:

### Check Current Tokens
```javascript
console.log('Token:', sessionStorage.getItem('app_transfer_token'));
console.log('Source:', sessionStorage.getItem('app_transfer_source'));
console.log('Timestamp:', sessionStorage.getItem('app_transfer_timestamp'));
```

### Check Token Age
```javascript
const ts = parseInt(sessionStorage.getItem('app_transfer_timestamp'));
const age = Date.now() - ts;
console.log('Token age (ms):', age);
console.log('Token expired?', age > 30000);
```

### Generate Test Token
```javascript
const token = crypto.randomUUID() + '-' + Date.now();
sessionStorage.setItem('app_transfer_token', token);
sessionStorage.setItem('app_transfer_source', 'aceas');
sessionStorage.setItem('app_transfer_timestamp', Date.now().toString());
console.log('Test token:', token);
```

### Clear All Tokens
```javascript
sessionStorage.removeItem('app_transfer_token');
sessionStorage.removeItem('app_transfer_source');
sessionStorage.removeItem('app_transfer_timestamp');
console.log('Tokens cleared');
```

---

## Test Summary Checklist

- [ ] Test Case 1: Valid Switch ACEAS → CPDS
- [ ] Test Case 2: Valid Switch CPDS → ACEAS
- [ ] Test Case 3: Invalid - Direct URL Access
- [ ] Test Case 4: Invalid - Bookmark Access
- [ ] Test Case 5: Invalid - Token Expired
- [ ] Test Case 6: Invalid - Token Manipulation
- [ ] Test Case 7: Invalid - Wrong Source
- [ ] Test Case 8: Token Cleanup After Success
- [ ] Test Case 9: Multiple Rapid Switches
- [ ] Test Case 10: Hash Persistence

---

## Expected Log Messages

### Success Scenario
```
Authenticated.
Valid transfer token detected - redirecting to login
```

### Invalid Token Scenarios
```
Transfer token mismatch or missing
Invalid transfer source
Transfer token expired
Invalid or missing transfer token - login required
```

---

## Notes

- All tests should be performed in a clean browser session
- Clear cookies and storage between major test scenarios if needed
- Use incognito/private mode to ensure clean state
- Test in multiple browsers (Chrome, Firefox, Safari) if possible
- The 30-second token expiry is intentional for security
- sessionStorage is tab-scoped, so new tabs won't have the token

---
name: jsdom-let-const-vm-pattern
description: How to test single-file HTML/JS apps where top-level let/const must be visible from Jest tests
metadata:
  type: feedback
---

When testing browser JS that uses top-level `let`/`const` declarations (not `var`), those identifiers are NOT promoted to `window` properties even when the script is evaluated inside a jsdom context. Accessing `dom.window.current` will return `undefined`.

**The correct pattern:**

1. Build jsdom with `runScripts: 'outside-only'` (not `dangerously`) — this gives access to `getInternalVMContext()` without auto-executing the inline scripts.
2. Extract the raw `<script>` block text via regex.
3. Transform all top-level `let`/`const` declarations to `var` using:
   ```js
   const transformed = src.replace(/^(\s*)(let|const)(\s)/gm, '$1var$3');
   ```
   The `^` anchor with `m` flag safely limits replacement to line-starts, leaving block-scoped let/const inside functions untouched.
4. Evaluate via `vm.runInContext(transformed, dom.getInternalVMContext())`.
5. All identifiers are now accessible as `dom.window.current`, `dom.window.operator`, etc.

**Why:** `var` at the top level of a vm script is promoted to the global object; `let`/`const` are not. This is a fundamental JavaScript scoping rule that applies in both browsers and Node vm contexts.

**Also note:** After `setOperator()`, `current` is NOT reset to `'0'` — it retains the first operand value until `inputDigit` or `inputDecimal` is called with `waitingForSecond=true`. Tests that rely on `current` being `'0'` after pressing an operator must explicitly call `inputDigit('0')` to set the second operand.

**Setup file:** A `jest.setup.js` polyfill is needed on Node 22 + jest-environment-jsdom v29 to avoid `TextEncoder is not defined`:
```js
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
```
Reference this from `package.json` jest config as `"setupFiles": ["./jest.setup.js"]`.

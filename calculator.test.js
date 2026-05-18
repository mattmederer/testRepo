/**
 * calculator.test.js
 *
 * Unit tests for the logic embedded in calculator.html.
 *
 * Strategy
 * --------
 * All calculator functions and state live in a single <script> block that
 * uses top-level `let`/`const` declarations tightly coupled to the DOM.
 * Because `let`/`const` at the top level of a vm script are NOT promoted to
 * window properties, we:
 *   1. Build a jsdom from the HTML with runScripts: 'outside-only' so we get
 *      a vm context but the inline script is NOT auto-executed.
 *   2. Extract the raw <script> text, replace every top-level let/const with
 *      var (which ARE promoted to the window/global object in vm context).
 *   3. Evaluate the transformed script via vm.runInContext so all identifiers
 *      land on dom.window and are inspectable from tests.
 *
 * A fresh jsdom is created before every test so each test starts with
 * completely clean state (current='0', operator=null, etc.).
 *
 * Coverage
 * --------
 *  inputDigit      — normal append, leading-zero replacement, 13-char cap,
 *                    waitingForSecond replacement
 *  inputDecimal    — normal, duplicate guard, waitingForSecond case
 *  toggleSign      — positive → negative, negative → positive, zero no-op
 *  percentage      — positive value, result precision
 *  setOperator     — stores state, chained operator triggers compute first
 *  compute         — all four operators, division by zero, finalize flag,
 *                    expression string, equals with no operator (no-op)
 *  clearAll        — full state reset
 *  fmt             — short string passes through, long string uses toPrecision(7)
 *  backspace       — removes last char, collapses single char to '0',
 *                    collapses lone '-' to '0', waitingForSecond resets to '0'
 *  render          — error class / text for 'Error' and 'Infinity' states
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const { JSDOM } = require('jsdom');

// ---------------------------------------------------------------------------
// Load and pre-process the calculator source once
// ---------------------------------------------------------------------------

const htmlSource = fs.readFileSync(
  path.join(__dirname, 'calculator.html'),
  'utf8'
);

const scriptMatch = htmlSource.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
if (!scriptMatch) throw new Error('No <script> block found in calculator.html');

/**
 * Replace top-level `let` and `const` declarations with `var` so that
 * vm.runInContext promotes them to the global (window) object.
 * Only replaces occurrences at the start of a line (with optional leading
 * whitespace), which safely ignores let/const inside block scopes.
 */
const transformedScript = scriptMatch[1].replace(
  /^(\s*)(let|const)(\s)/gm,
  '$1var$3'
);

// ---------------------------------------------------------------------------
// Per-test context helpers
// ---------------------------------------------------------------------------

let dom;
let g; // shorthand alias for dom.window

function createFreshContext() {
  // runScripts: 'outside-only' gives us getInternalVMContext() without
  // auto-executing the inline <script> tags in the HTML.
  dom = new JSDOM(htmlSource, { runScripts: 'outside-only' });
  g   = dom.window;
  vm.runInContext(transformedScript, dom.getInternalVMContext());
}

/** Text currently shown in the #result element. */
function displayText() {
  return g.document.getElementById('result').textContent;
}

/** Class string on the #result element. */
function displayClasses() {
  return g.document.getElementById('result').className;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  createFreshContext();
});

afterEach(() => {
  dom.window.close();
});

// ============================================================
// inputDigit
// ============================================================
describe('inputDigit', () => {
  test('appends a digit to the current value', () => {
    g.inputDigit('1');
    g.inputDigit('2');
    g.inputDigit('3');
    expect(g.current).toBe('123');
  });

  test('replaces a leading zero with the new digit', () => {
    // initial current is '0'
    g.inputDigit('5');
    expect(g.current).toBe('5');
  });

  test('does not replace leading zero when the digit is "." (guard branch)', () => {
    // The guard is: current === '0' && d !== '.'
    // Passing '.' as the digit argument preserves '0' and appends → '0.'
    g.inputDigit('.');
    expect(g.current).toBe('0.');
  });

  test('appends digit when current already has non-zero content', () => {
    g.inputDigit('4');
    g.inputDigit('2');
    expect(g.current).toBe('42');
  });

  test('caps input at 13 characters and ignores further digits', () => {
    '1234567890123'.split('').forEach(d => g.inputDigit(d));
    expect(g.current).toBe('1234567890123');
    g.inputDigit('4'); // 14th digit — must be ignored
    expect(g.current).toBe('1234567890123');
    expect(g.current.length).toBe(13);
  });

  test('exactly 13 characters are accepted', () => {
    '9999999999999'.split('').forEach(d => g.inputDigit(d));
    expect(g.current.length).toBe(13);
    expect(g.current).toBe('9999999999999');
  });

  test('replaces current when waitingForSecond is true', () => {
    g.inputDigit('7');
    g.waitingForSecond = true;
    g.inputDigit('3');
    expect(g.current).toBe('3');
    expect(g.waitingForSecond).toBe(false);
  });

  test('clears waitingForSecond flag after replacement', () => {
    g.waitingForSecond = true;
    g.inputDigit('9');
    expect(g.waitingForSecond).toBe(false);
  });
});

// ============================================================
// inputDecimal
// ============================================================
describe('inputDecimal', () => {
  test('appends decimal point to an integer current value', () => {
    g.inputDigit('5');
    g.inputDecimal();
    expect(g.current).toBe('5.');
  });

  test('starts "0." when current is "0"', () => {
    g.inputDecimal();
    expect(g.current).toBe('0.');
  });

  test('ignores a second decimal point (duplicate guard)', () => {
    g.inputDecimal();
    g.inputDecimal();
    expect(g.current).toBe('0.');
    expect((g.current.match(/\./g) || []).length).toBe(1);
  });

  test('ignores decimal when current already contains a dot mid-number', () => {
    g.inputDigit('3');
    g.inputDecimal();
    g.inputDigit('1');
    g.inputDecimal(); // second decimal — must be ignored
    expect(g.current).toBe('3.1');
  });

  test('starts "0." when waitingForSecond is true', () => {
    g.waitingForSecond = true;
    g.inputDecimal();
    expect(g.current).toBe('0.');
    expect(g.waitingForSecond).toBe(false);
  });

  test('clears waitingForSecond flag after decimal in waiting state', () => {
    g.waitingForSecond = true;
    g.inputDecimal();
    expect(g.waitingForSecond).toBe(false);
  });
});

// ============================================================
// toggleSign
// ============================================================
describe('toggleSign', () => {
  test('negates a positive number', () => {
    g.inputDigit('5');
    g.toggleSign();
    expect(g.current).toBe('-5');
  });

  test('removes the minus sign from a negative number', () => {
    g.inputDigit('5');
    g.toggleSign(); // → '-5'
    g.toggleSign(); // → '5'
    expect(g.current).toBe('5');
  });

  test('is a no-op when current is "0"', () => {
    g.toggleSign();
    expect(g.current).toBe('0');
  });

  test('works on decimal values', () => {
    g.inputDigit('3');
    g.inputDecimal();
    g.inputDigit('1');
    g.toggleSign();
    expect(g.current).toBe('-3.1');
  });

  test('toggles a multi-digit number correctly', () => {
    '123'.split('').forEach(d => g.inputDigit(d));
    g.toggleSign();
    expect(g.current).toBe('-123');
    g.toggleSign();
    expect(g.current).toBe('123');
  });
});

// ============================================================
// percentage
// ============================================================
describe('percentage', () => {
  test('divides current by 100', () => {
    g.inputDigit('5');
    g.inputDigit('0');
    g.percentage();
    expect(parseFloat(g.current)).toBeCloseTo(0.5);
  });

  test('converts 1 to 0.01', () => {
    g.inputDigit('1');
    g.percentage();
    expect(parseFloat(g.current)).toBeCloseTo(0.01);
  });

  test('converts 100 to 1', () => {
    g.inputDigit('1');
    g.inputDigit('0');
    g.inputDigit('0');
    g.percentage();
    expect(parseFloat(g.current)).toBeCloseTo(1);
  });

  test('handles zero (stays 0)', () => {
    g.percentage();
    expect(parseFloat(g.current)).toBe(0);
  });

  test('stores result as a string in current', () => {
    g.inputDigit('2');
    g.inputDigit('5');
    g.percentage();
    expect(typeof g.current).toBe('string');
    expect(g.current).toBe('0.25');
  });
});

// ============================================================
// setOperator
// ============================================================
describe('setOperator', () => {
  test('stores the previous value as a number', () => {
    g.inputDigit('7');
    g.setOperator('+');
    expect(g.previous).toBe(7);
  });

  test('stores the operator glyph', () => {
    g.inputDigit('3');
    g.setOperator('×');
    expect(g.operator).toBe('×');
  });

  test('marks waitingForSecond as true', () => {
    g.inputDigit('4');
    g.setOperator('−');
    expect(g.waitingForSecond).toBe(true);
  });

  test('builds an expression string containing the operand and operator', () => {
    g.inputDigit('8');
    g.setOperator('÷');
    expect(g.expression).toContain('8');
    expect(g.expression).toContain('÷');
  });

  test('chained operator computes the pending operation first', () => {
    // 5 + 3, then press ×: should compute 5+3=8 and store 8 as previous
    g.inputDigit('5');
    g.setOperator('+');
    g.inputDigit('3');
    g.setOperator('×');
    expect(g.previous).toBe(8);
    expect(g.operator).toBe('×');
  });

  test('chained operator keeps waitingForSecond true', () => {
    g.inputDigit('2');
    g.setOperator('+');
    g.inputDigit('2');
    g.setOperator('+');
    expect(g.waitingForSecond).toBe(true);
  });

  test('pressing a different operator while waitingForSecond just replaces the operator', () => {
    // operator is set, waitingForSecond is true — press another operator
    // should update operator without recomputing
    g.inputDigit('9');
    g.setOperator('+');           // waitingForSecond = true
    g.setOperator('−');           // should update operator, leave previous as 9
    expect(g.operator).toBe('−');
    expect(g.previous).toBe(9);  // previous must not have changed
  });
});

// ============================================================
// compute — addition
// ============================================================
describe('compute — addition', () => {
  test('adds two positive integers', () => {
    g.inputDigit('3');
    g.setOperator('+');
    g.inputDigit('4');
    g.compute(true);
    expect(parseFloat(g.current)).toBe(7);
  });

  test('adds a positive and a negative number', () => {
    g.inputDigit('1');
    g.inputDigit('0');
    g.setOperator('+');
    g.inputDigit('5');
    g.toggleSign();   // −5
    g.compute(true);
    expect(parseFloat(g.current)).toBe(5);
  });

  test('adds decimals correctly', () => {
    g.inputDigit('0'); g.inputDecimal(); g.inputDigit('1');
    g.setOperator('+');
    g.inputDigit('0'); g.inputDecimal(); g.inputDigit('2');
    g.compute(true);
    expect(parseFloat(g.current)).toBeCloseTo(0.3);
  });
});

// ============================================================
// compute — subtraction
// ============================================================
describe('compute — subtraction', () => {
  test('subtracts two positive integers', () => {
    g.inputDigit('9');
    g.setOperator('−');
    g.inputDigit('4');
    g.compute(true);
    expect(parseFloat(g.current)).toBe(5);
  });

  test('result can be negative', () => {
    g.inputDigit('3');
    g.setOperator('−');
    g.inputDigit('8');
    g.compute(true);
    expect(parseFloat(g.current)).toBe(-5);
  });
});

// ============================================================
// compute — multiplication
// ============================================================
describe('compute — multiplication', () => {
  test('multiplies two positive integers', () => {
    g.inputDigit('6');
    g.setOperator('×');
    g.inputDigit('7');
    g.compute(true);
    expect(parseFloat(g.current)).toBe(42);
  });

  test('multiplying by zero yields zero', () => {
    g.inputDigit('9');
    g.setOperator('×');
    g.inputDigit('0'); // explicitly enter 0 as the second operand
    g.compute(true);
    expect(parseFloat(g.current)).toBe(0);
  });
});

// ============================================================
// compute — division
// ============================================================
describe('compute — division', () => {
  test('divides two positive integers', () => {
    g.inputDigit('8');
    g.setOperator('÷');
    g.inputDigit('2');
    g.compute(true);
    expect(parseFloat(g.current)).toBe(4);
  });

  test('handles non-integer division', () => {
    g.inputDigit('1');
    g.setOperator('÷');
    g.inputDigit('3');
    g.compute(true);
    // toPrecision(13) of 1/3 ≈ 0.3333333333333
    expect(parseFloat(g.current)).toBeCloseTo(1 / 3, 10);
  });

  test('division by zero produces the string "Infinity"', () => {
    g.inputDigit('5');
    g.setOperator('÷');
    g.inputDigit('0'); // explicitly enter 0 as the second operand
    g.compute(true);
    expect(g.current).toBe('Infinity');
  });
});

// ============================================================
// compute — state after equals
// ============================================================
describe('compute — state after equals', () => {
  test('resets operator to null after finalize', () => {
    g.inputDigit('2'); g.setOperator('+'); g.inputDigit('2');
    g.compute(true);
    expect(g.operator).toBeNull();
  });

  test('resets previous to null after finalize', () => {
    g.inputDigit('2'); g.setOperator('+'); g.inputDigit('2');
    g.compute(true);
    expect(g.previous).toBeNull();
  });

  test('sets waitingForSecond to true after finalize', () => {
    g.inputDigit('2'); g.setOperator('+'); g.inputDigit('2');
    g.compute(true);
    expect(g.waitingForSecond).toBe(true);
  });

  test('builds the finalized expression string (includes both operands and =)', () => {
    g.inputDigit('3'); g.setOperator('+'); g.inputDigit('4');
    g.compute(true);
    expect(g.expression).toContain('3');
    expect(g.expression).toContain('+');
    expect(g.expression).toContain('4');
    expect(g.expression).toContain('=');
  });

  test('pressing equals with no operator set is a no-op', () => {
    g.inputDigit('9');
    const before = g.current;
    g.compute(true);
    expect(g.current).toBe(before);
  });

  test('pressing equals when previous is null is a no-op', () => {
    g.current  = '5';
    g.operator = '+';
    g.previous = null;
    g.compute(true);
    expect(g.current).toBe('5');
  });

  test('second equals press does not recompute (operator is now null)', () => {
    g.inputDigit('4'); g.setOperator('+'); g.inputDigit('3');
    g.compute(true);
    const firstResult = g.current;
    g.compute(true); // no-op
    expect(g.current).toBe(firstResult);
  });
});

// ============================================================
// Chained operations (operator pressed without = in between)
// ============================================================
describe('chained operations', () => {
  test('5 + 3 × 2 = 16  (left-to-right, no precedence)', () => {
    // Calculator is left-associative: (5 + 3) × 2 = 16
    g.inputDigit('5');
    g.setOperator('+');
    g.inputDigit('3');
    g.setOperator('×'); // triggers compute(false): 5+3=8, previous=8
    g.inputDigit('2');
    g.compute(true);
    expect(parseFloat(g.current)).toBe(16);
  });

  test('10 − 3 + 2 = 9  (left-to-right subtraction then addition)', () => {
    g.inputDigit('1'); g.inputDigit('0');
    g.setOperator('−');
    g.inputDigit('3');
    g.setOperator('+'); // computes 10 − 3 = 7
    g.inputDigit('2');
    g.compute(true);
    expect(parseFloat(g.current)).toBe(9);
  });

  test('intermediate compute(false) does not append "=" to expression', () => {
    g.inputDigit('5');
    g.setOperator('+');
    g.inputDigit('3');
    g.setOperator('×'); // triggers compute(false)
    expect(g.expression).not.toMatch(/=\s*$/);
  });
});

// ============================================================
// clearAll
// ============================================================
describe('clearAll', () => {
  test('resets current to "0"', () => {
    g.inputDigit('5'); g.inputDigit('9');
    g.clearAll();
    expect(g.current).toBe('0');
  });

  test('resets previous to null', () => {
    g.inputDigit('3'); g.setOperator('+');
    g.clearAll();
    expect(g.previous).toBeNull();
  });

  test('resets operator to null', () => {
    g.inputDigit('3'); g.setOperator('+');
    g.clearAll();
    expect(g.operator).toBeNull();
  });

  test('resets waitingForSecond to false', () => {
    g.inputDigit('3'); g.setOperator('+');
    g.clearAll();
    expect(g.waitingForSecond).toBe(false);
  });

  test('resets expression to empty string', () => {
    g.inputDigit('3'); g.setOperator('+');
    g.clearAll();
    expect(g.expression).toBe('');
  });

  test('display shows "0" after clear', () => {
    g.inputDigit('7');
    g.clearAll();
    expect(displayText()).toBe('0');
  });
});

// ============================================================
// fmt
// ============================================================
describe('fmt', () => {
  test('short integer string passes through unchanged', () => {
    expect(g.fmt('42')).toBe('42');
  });

  test('short decimal string passes through', () => {
    expect(g.fmt('3.14')).toBe('3.14');
  });

  test('non-numeric string is returned as-is', () => {
    expect(g.fmt('Error')).toBe('Error');
  });

  test('string of exactly 10 chars passes through', () => {
    // '1234567890' → parseFloat → 1234567890 → String → length 10 → no toPrecision
    expect(g.fmt('1234567890')).toBe('1234567890');
  });

  test('string of 11 chars triggers toPrecision(7)', () => {
    const n = 12345678901;
    expect(g.fmt(String(n))).toBe(n.toPrecision(7));
  });

  test('string longer than 10 chars uses toPrecision(7)', () => {
    const n = 12345678901;
    const result = g.fmt('12345678901');
    expect(result).toBe(n.toPrecision(7));
  });

  test('strips trailing zeros via parseFloat before the length check', () => {
    // '1.0' → parseFloat → 1 → String → '1' (length 1) → passes through
    expect(g.fmt('1.0')).toBe('1');
  });

  test('handles negative numbers', () => {
    expect(g.fmt('-5')).toBe('-5');
  });

  test('toPrecision(7) for a very long negative number', () => {
    const n = -12345678901;
    // String(n) = '-12345678901' → length 12 > 10 → toPrecision(7)
    expect(g.fmt(String(n))).toBe(n.toPrecision(7));
  });
});

// ============================================================
// Backspace (keyboard handler)
// ============================================================
describe('backspace', () => {
  /**
   * Backspace logic lives in a keydown listener on the document.
   * We simulate it with a real KeyboardEvent dispatched on the jsdom document.
   */
  function pressBackspace() {
    const evt = new g.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    g.document.dispatchEvent(evt);
  }

  test('removes the last character from a multi-character current', () => {
    g.inputDigit('1'); g.inputDigit('2'); g.inputDigit('3');
    pressBackspace();
    expect(g.current).toBe('12');
  });

  test('collapses a single digit to "0"', () => {
    g.inputDigit('7');
    pressBackspace();
    expect(g.current).toBe('0');
  });

  test('collapses initial "0" to "0" (length 1 → reset path)', () => {
    pressBackspace();
    expect(g.current).toBe('0');
  });

  test('collapses lone "-" to "0" when sign was toggled then backspaced', () => {
    g.inputDigit('5');
    g.toggleSign();   // current = '-5'
    pressBackspace(); // current = '-' → collapses to '0'
    expect(g.current).toBe('0');
  });

  test('removes decimal point correctly', () => {
    g.inputDigit('3');
    g.inputDecimal();
    pressBackspace();
    expect(g.current).toBe('3');
  });

  test('resets to "0" when waitingForSecond is true', () => {
    g.inputDigit('5');
    g.setOperator('+'); // sets waitingForSecond = true
    pressBackspace();
    expect(g.current).toBe('0');
  });
});

// ============================================================
// render — error states
// ============================================================
describe('render — error and infinity display', () => {
  test('adds "error" class when current is "Error"', () => {
    g.current = 'Error';
    g.render();
    expect(displayClasses()).toContain('error');
  });

  test('adds "error" class when current is "Infinity"', () => {
    g.current = 'Infinity';
    g.render();
    expect(displayClasses()).toContain('error');
  });

  test('shows text "Error" when current is "Error"', () => {
    g.current = 'Error';
    g.render();
    expect(displayText()).toBe('Error');
  });

  test('shows text "∞ Error" when current is "Infinity"', () => {
    g.current = 'Infinity';
    g.render();
    expect(displayText()).toBe('∞ Error');
  });

  test('does NOT add "error" class for a normal number', () => {
    g.inputDigit('5');
    g.render();
    expect(displayClasses()).not.toContain('error');
  });

  test('result element has base class "result" for normal values', () => {
    g.render();
    expect(displayClasses()).toBe('result');
  });
});

// ============================================================
// Integration smoke tests (full user flows)
// ============================================================
describe('integration — full user flows', () => {
  test('2 + 2 = 4', () => {
    g.inputDigit('2'); g.setOperator('+'); g.inputDigit('2');
    g.compute(true);
    expect(parseFloat(g.current)).toBe(4);
  });

  test('12 × 12 = 144', () => {
    g.inputDigit('1'); g.inputDigit('2');
    g.setOperator('×');
    g.inputDigit('1'); g.inputDigit('2');
    g.compute(true);
    expect(parseFloat(g.current)).toBe(144);
  });

  test('1 ÷ 0 shows Infinity in state and "∞ Error" on display', () => {
    g.inputDigit('1');
    g.setOperator('÷');
    g.inputDigit('0'); // explicitly enter 0 as divisor
    g.compute(true);
    expect(g.current).toBe('Infinity');
    expect(displayText()).toBe('∞ Error');
  });

  test('clear after error resets state and display to "0"', () => {
    g.inputDigit('1'); g.setOperator('÷'); g.inputDigit('0');
    g.compute(true);  // Infinity
    g.clearAll();
    expect(g.current).toBe('0');
    expect(displayText()).toBe('0');
  });

  test('percentage then add: 200 + 50% → 200 + 0.5 = 200.5', () => {
    g.inputDigit('2'); g.inputDigit('0'); g.inputDigit('0');
    g.setOperator('+');
    g.inputDigit('5'); g.inputDigit('0');
    g.percentage(); // 50 → 0.5
    g.compute(true);
    expect(parseFloat(g.current)).toBeCloseTo(200.5);
  });

  test('negative number arithmetic: -3 + 5 = 2', () => {
    g.inputDigit('3');
    g.toggleSign();   // current = '-3'
    g.setOperator('+');
    g.inputDigit('5');
    g.compute(true);
    expect(parseFloat(g.current)).toBe(2);
  });
});

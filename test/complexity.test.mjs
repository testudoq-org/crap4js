import { describe, it, expect } from 'vitest';
import { extractFunctions } from '../src/complexity.mjs';

const file = 'test.mjs';

describe('complexity.mjs', () => {
  describe('CC counting', () => {
    it('empty function: CC = 1', () => {
      const fns = extractFunctions('function empty() {}', file);
      expect(fns[0].cc).toBe(1);
    });

    it('one if: CC = 2', () => {
      const fns = extractFunctions('function f() { if (x) {} }', file);
      expect(fns[0].cc).toBe(2);
    });

    it('if + else if: CC = 3', () => {
      const fns = extractFunctions(
        'function f() { if (a) {} else if (b) {} }', file
      );
      expect(fns[0].cc).toBe(3);
    });

    it('one &&: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { return a && b; }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('one ||: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { return a || b; }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('one ??: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { return a ?? b; }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('||= operator: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { let x; x ||= 1; }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('&&= operator: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { let x; x &&= 1; }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('??= operator: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { let x; x ??= 1; }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('?. optional chaining: CC = 1 (NOT counted)', () => {
      const fns = extractFunctions(
        'function f() { return a?.b; }', file
      );
      expect(fns[0].cc).toBe(1);
    });

    it('?. chain with two links (a?.b?.c): CC = 1', () => {
      const fns = extractFunctions(
        'function f() { return a?.b?.c; }', file
      );
      expect(fns[0].cc).toBe(1);
    });

    it('default parameter f(x = 0): CC = 1 (NOT counted)', () => {
      const fns = extractFunctions(
        'function f(x = 0) { return x; }', file
      );
      expect(fns[0].cc).toBe(1);
    });

    it('destructuring default { x = 0 }: CC = 1 (NOT counted)', () => {
      const fns = extractFunctions(
        'function f() { const { x = 0 } = {}; return x; }', file
      );
      expect(fns[0].cc).toBe(1);
    });

    it('switch with 3 cases + default: CC = 4', () => {
      const fns = extractFunctions(`
        function f(x) {
          switch(x) {
            case 1: break;
            case 2: break;
            case 3: break;
            default: break;
          }
        }
      `, file);
      expect(fns[0].cc).toBe(4); // 1 base + 3 cases
    });

    it('for loop: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { for (let i = 0; i < 10; i++) {} }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('for...of: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { for (const x of []) {} }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('for await...of: CC = 2', () => {
      const fns = extractFunctions(
        'async function f() { for await (const x of []) {} }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('while: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { while (x) {} }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('do...while: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { do {} while (x); }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('try/catch: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { try { x(); } catch(e) {} }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('try/finally only: CC = 1', () => {
      const fns = extractFunctions(
        'function f() { try { x(); } finally {} }', file
      );
      expect(fns[0].cc).toBe(1);
    });

    it('try/catch/finally: CC = 2 (finally not counted)', () => {
      const fns = extractFunctions(
        'function f() { try { x(); } catch(e) {} finally {} }', file
      );
      expect(fns[0].cc).toBe(2);
    });

    it('ternary: CC = 2', () => {
      const fns = extractFunctions(
        'function f() { return x ? 1 : 2; }', file
      );
      expect(fns[0].cc).toBe(2);
    });
  });

  describe('naming', () => {
    it('named function declaration: uses function name', () => {
      const fns = extractFunctions('function myFunc() {}', file);
      expect(fns[0].name).toBe('myFunc');
    });

    it('arrow in const: uses variable name', () => {
      const fns = extractFunctions('const handler = () => {};', file);
      expect(fns[0].name).toBe('handler');
    });

    it('async arrow in const: uses variable name', () => {
      const fns = extractFunctions('const handler = async () => {};', file);
      expect(fns[0].name).toBe('handler');
    });

    it('arrow assigned by assignment expression: uses target variable name', () => {
      const fns = extractFunctions('foo = () => {};', file);
      expect(fns[0].name).toBe('foo');
    });

    it('class method: uses ClassName.methodName', () => {
      const fns = extractFunctions(`
        class Validator {
          check() { return true; }
        }
      `, file);
      expect(fns[0].name).toBe('Validator.check');
    });

    it('object method: uses property key', () => {
      const fns = extractFunctions(`
        const obj = { process() { return 1; } };
      `, file);
      expect(fns[0].name).toBe('process');
    });

    it('IIFE: <anonymous:line>', () => {
      const fns = extractFunctions('(function() { return 1; })();', file);
      expect(fns[0].name).toMatch(/^<anonymous:\d+>$/);
    });

    it('callback argument: <anonymous:line>', () => {
      const fns = extractFunctions(
        'const x = [1].filter(x => x > 0);', file
      );
      // Should have the arrow function
      const anon = fns.find(f => f.name.startsWith('<anonymous:'));
      expect(anon).toBeDefined();
    });
  });

  describe('isolation', () => {
    it('nested function: outer CC unaffected by inner branches', () => {
      const fns = extractFunctions(`
        function outer() {
          if (a) {}
          function inner() {
            if (b) {}
            if (c) {}
          }
        }
      `, file);
      const outer = fns.find(f => f.name === 'outer');
      const inner = fns.find(f => f.name === 'inner');
      expect(outer.cc).toBe(2); // 1 base + 1 if
      expect(inner.cc).toBe(3); // 1 base + 2 ifs
    });

    it('generator function: recognised as function, yield not counted', () => {
      const fns = extractFunctions(`
        function* gen() {
          yield 1;
          yield 2;
          if (x) yield 3;
        }
      `, file);
      expect(fns[0].name).toBe('gen');
      expect(fns[0].cc).toBe(2); // 1 base + 1 if, yields not counted
    });

    it('TypeScript function with type annotations: parses without error', () => {
      const fns = extractFunctions(`
        function greet(name: string): string {
          if (name) return 'Hello ' + name;
          return 'Hello';
        }
      `, file);
      expect(fns[0].name).toBe('greet');
      expect(fns[0].cc).toBe(2);
    });
  });

  describe('line tracking', () => {
    it('records correct start and end lines', () => {
      const source = `function a() {
  return 1;
}

function b() {
  return 2;
}`;
      const fns = extractFunctions(source, file);
      expect(fns[0].startLine).toBe(1);
      expect(fns[0].endLine).toBe(3);
      expect(fns[1].startLine).toBe(5);
      expect(fns[1].endLine).toBe(7);
    });
  });

  describe('single-pass parity', () => {
    it('nested functions: produces identical entries to expected output', () => {
      const fns = extractFunctions(`
        function outer() {
          if (a) {}
          function inner() {
            if (b) {}
            if (c) {}
          }
        }
      `, file);
      expect(fns).toEqual([
        { name: 'inner', file, startLine: 4, endLine: 7, cc: 3 },
        { name: 'outer', file, startLine: 2, endLine: 8, cc: 2 },
      ]);
    });

    it('class with method: produces correct entry', () => {
      const fns = extractFunctions(`
        class Validator {
          check(input) {
            if (!input) return false;
            return input.length > 0;
          }
        }
      `, file);
      expect(fns).toEqual([
        { name: 'Validator.check', file, startLine: 3, endLine: 6, cc: 2 },
      ]);
    });

    it('anonymous callback in array method: produces correct entry', () => {
      const fns = extractFunctions(`
        const items = [1, 2, 3];
        const result = items.filter(x => x > 0 && x < 10);
      `, file);
      const anon = fns.find(f => f.name.startsWith('<anonymous:'));
      expect(anon).toBeDefined();
      expect(anon.file).toBe(file);
      expect(anon.startLine).toBeGreaterThan(0);
      expect(anon.endLine).toBeGreaterThanOrEqual(anon.startLine);
      expect(anon.cc).toBeGreaterThanOrEqual(1);
    });

    it('arrow assigned via variable declarator and assignment expression', () => {
      const fns = extractFunctions(`
        const handler = () => {};
        foo = () => {};
      `, file);
      expect(fns).toEqual([
        { name: 'handler', file, startLine: 2, endLine: 2, cc: 1 },
        { name: 'foo', file, startLine: 3, endLine: 3, cc: 1 },
      ]);
    });
  });
});

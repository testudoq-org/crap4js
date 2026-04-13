/**
 * complexity.mjs — AST walker, CC computation, function extraction
 */

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

// Handle both ESM default and CJS interop
const traverse = _traverse.default || _traverse;

/**
 * @typedef {Object} FunctionEntry
 * @property {string} name
 * @property {string} file
 * @property {number} startLine
 * @property {number} endLine
 * @property {number} cc
 */

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ObjectMethod',
  'ClassMethod',
  'ClassPrivateMethod',
]);

const CC_NODE_TYPES = new Set([
  'IfStatement',
  'ConditionalExpression',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'CatchClause',
]);

/**
 * Resolve a function's name from its AST context.
 * @param {import('@babel/traverse').NodePath} path
 * @returns {string}
 */
function resolveName(path) {
  const node = path.node;

  // FunctionDeclaration with id
  if (node.type === 'FunctionDeclaration' && node.id) {
    return node.id.name;
  }

  // ClassMethod / ClassPrivateMethod → ClassName.methodName
  if (node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod') {
    const methodName = node.type === 'ClassPrivateMethod'
      ? `#${node.key.id.name}`
      : (node.key.name || node.key.value || String(node.key));
    // Walk up to ClassDeclaration/ClassExpression
    let current = path.parentPath;
    while (current) {
      if (current.node.type === 'ClassDeclaration' || current.node.type === 'ClassExpression') {
        const className = current.node.id ? current.node.id.name : '<anonymous>';
        return `${className}.${methodName}`;
      }
      current = current.parentPath;
    }
    return methodName;
  }

  // ObjectMethod → property key name
  if (node.type === 'ObjectMethod') {
    return node.key.name || node.key.value || String(node.key);
  }

  // Arrow or FunctionExpression in VariableDeclarator
  if (path.parent && path.parent.type === 'VariableDeclarator' && path.parent.id) {
    return path.parent.id.name;
  }

  // Arrow or FunctionExpression in assignment: foo = function() {}
  if (path.parent && path.parent.type === 'AssignmentExpression' && path.parent.left) {
    if (path.parent.left.name) return path.parent.left.name;
  }

  // FunctionExpression with id (named expression)
  if (node.type === 'FunctionExpression' && node.id) {
    return node.id.name;
  }

  // Fallback: anonymous with line number
  return `<anonymous:${node.loc ? node.loc.start.line : '?'}>`;
}

/**
 * Count cyclomatic complexity inside a function body (not descending into nested functions).
 * @param {import('@babel/traverse').NodePath} functionPath
 * @returns {number}
 */
function countCC(functionPath) {
  let cc = 1; // base complexity

  functionPath.traverse({
    enter(innerPath) {
      const node = innerPath.node;

      // Stop at nested function boundaries
      if (FUNCTION_TYPES.has(node.type) && innerPath !== functionPath) {
        innerPath.skip();
        return;
      }

      // Standard CC nodes
      if (CC_NODE_TYPES.has(node.type)) {
        // For SwitchCase, only count non-default cases
        cc++;
        return;
      }

      // SwitchCase: +1 per case with test (not default)
      if (node.type === 'SwitchCase' && node.test !== null) {
        cc++;
        return;
      }

      // LogicalExpression: &&, ||, ??
      if (node.type === 'LogicalExpression' &&
          (node.operator === '&&' || node.operator === '||' || node.operator === '??')) {
        cc++;
        return;
      }

      // Logical assignment operators: ||=, &&=, ??=
      if (node.type === 'AssignmentExpression' &&
          (node.operator === '||=' || node.operator === '&&=' || node.operator === '??=')) {
        cc++;
        return;
      }
    },
  });

  return cc;
}

/**
 * Extract all functions from a source file with their CC scores.
 * @param {string} source
 * @param {string} filePath
 * @returns {FunctionEntry[]}
 */
export function extractFunctions(source, filePath) {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    errorRecovery: true,
  });

  const functions = [];

  traverse(ast, {
    enter(path) {
      if (!FUNCTION_TYPES.has(path.node.type)) return;

      const name = resolveName(path);
      const startLine = path.node.loc ? path.node.loc.start.line : 0;
      const endLine = path.node.loc ? path.node.loc.end.line : 0;
      const cc = countCC(path);

      functions.push({ name, file: filePath, startLine, endLine, cc });
    },
  });

  return functions;
}

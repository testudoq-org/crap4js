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
function classMethodName(path) {
  const node = path.node;
  const methodName = getClassMethodName(node);
  const className = resolveClassName(path);
  return `${className}.${methodName}`;
}

function getClassMethodName(node) {
  if (node.type === 'ClassPrivateMethod') {
    return `#${node.key.id.name}`;
  }
  return resolveKeyName(node.key);
}

function resolveKeyName(key) {
  if (key.name) return key.name;
  if (key.value) return key.value;
  return String(key);
}

function resolveClassName(path) {
  const parentClass = path.findParent(p => p.isClassDeclaration() || p.isClassExpression());
  return classNameFromParent(parentClass);
}

function classNameFromParent(parentClass) {
  if (!parentClass) return '<anonymous>';
  const id = parentClass.node?.id;
  if (!id || !id.name) return '<anonymous>';
  return id.name;
}

function objectMethodName(path) {
  const key = path.node.key;
  return key.name || key.value || String(key);
}

function variableDeclaratorName(path) {
  const parent = path.parent;
  if (!parent || parent.type !== 'VariableDeclarator' || !parent.id) return null;
  return parent.id.name;
}

function assignmentExpressionName(path) {
  const parent = path.parent;
  if (!parent || parent.type !== 'AssignmentExpression') return null;
  return resolveAssignmentTargetName(parent.left);
}

function resolveAssignmentTargetName(left) {
  if (!left) return null;
  if (left.name) return left.name;
  return null;
}

function functionExpressionName(node) {
  return node.id ? node.id.name : null;
}

const NAME_RESOLVERS = {
  FunctionDeclaration: (path) => path.node.id?.name ?? null,
  ClassMethod: classMethodName,
  ClassPrivateMethod: classMethodName,
  ObjectMethod: objectMethodName,
  FunctionExpression: (path) => functionExpressionName(path.node) || variableDeclaratorName(path),
  ArrowFunctionExpression: (path) => variableDeclaratorName(path) || assignmentExpressionName(path),
};

function resolveName(path) {
  const node = path.node;
  const resolver = NAME_RESOLVERS[node.type];
  const resolved = resolver?.(path);
  return resolved || `<anonymous:${node.loc?.start.line ?? '?'}>`;
}

/**
 * Count cyclomatic complexity inside a function body (not descending into nested functions).
 * @param {import('@babel/traverse').NodePath} functionPath
 * @returns {number}
 */
const LOGICAL_OPERATORS = new Set(['&&', '||', '??']);
const ASSIGNMENT_OPERATORS = new Set(['||=', '&&=', '??=']);

const COMPLEXITY_HANDLERS = {
  SwitchCase: (node) => node.test !== null ? 1 : 0,
  LogicalExpression: (node) => LOGICAL_OPERATORS.has(node.operator) ? 1 : 0,
  AssignmentExpression: (node) => ASSIGNMENT_OPERATORS.has(node.operator) ? 1 : 0,
};

function nodeComplexity(node) {
  if (CC_NODE_TYPES.has(node.type)) return 1;
  return COMPLEXITY_HANDLERS[node.type]?.(node) || 0;
}

function countCC(functionPath) {
  let cc = 1; // base complexity

  functionPath.traverse({
    enter(innerPath) {
      const node = innerPath.node;

      if (FUNCTION_TYPES.has(node.type) && innerPath !== functionPath) {
        innerPath.skip();
        return;
      }

      cc += nodeComplexity(node);
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

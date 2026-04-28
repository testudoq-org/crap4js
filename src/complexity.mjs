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
  const methodName = node.type === 'ClassPrivateMethod'
    ? `#${node.key.id.name}`
    : (node.key.name || node.key.value || String(node.key));
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

function objectMethodName(path) {
  const key = path.node.key;
  return key.name || key.value || String(key);
}

function variableDeclaratorName(path) {
  const parent = path.parent;
  return parent && parent.type === 'VariableDeclarator' && parent.id
    ? parent.id.name
    : null;
}

function assignmentExpressionName(path) {
  const parent = path.parent;
  if (parent && parent.type === 'AssignmentExpression' && parent.left) {
    return parent.left.name || null;
  }
  return null;
}

function functionExpressionName(node) {
  return node.id ? node.id.name : null;
}

function resolveName(path) {
  const node = path.node;

  if (node.type === 'FunctionDeclaration' && node.id) {
    return node.id.name;
  }

  if (node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod') {
    return classMethodName(path);
  }

  if (node.type === 'ObjectMethod') {
    return objectMethodName(path);
  }

  const declaratorName = variableDeclaratorName(path);
  if (declaratorName) return declaratorName;

  const assignmentName = assignmentExpressionName(path);
  if (assignmentName) return assignmentName;

  const expressionName = functionExpressionName(node);
  if (expressionName) return expressionName;

  return `<anonymous:${node.loc ? node.loc.start.line : '?'}>`;
}

/**
 * Count cyclomatic complexity inside a function body (not descending into nested functions).
 * @param {import('@babel/traverse').NodePath} functionPath
 * @returns {number}
 */
function nodeComplexity(node) {
  if (CC_NODE_TYPES.has(node.type)) return 1;
  if (node.type === 'SwitchCase' && node.test !== null) return 1;
  if (node.type === 'LogicalExpression' && ['&&', '||', '??'].includes(node.operator)) return 1;
  if (node.type === 'AssignmentExpression' && ['||=', '&&=', '??='].includes(node.operator)) return 1;
  return 0;
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

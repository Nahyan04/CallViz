import * as fs from 'fs';
import * as path from 'path';
import * as acorn from 'acorn';

export interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  file: string;
  paramsString: string;
}

// Parse one file using Acorn and return a record keyed by startLine
export function buildFunctionNameMapForFile(filePath: string): Record<number, FunctionInfo> {
  const source = fs.readFileSync(filePath, 'utf-8');
  const ast = acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module', // potentially might use 'script'..
    locations: true
  });

  const fnMap: Record<number, FunctionInfo> = {};

  // Helper function to record the info
  function recordFunction(name: string, startLine: number, endLine: number, params: string) {
    // check for duplicates
    if (!fnMap[startLine]) {
      // If still not found, fallback..
      const displayName = name === '(anonymous)'
        ? `(anonymous: ${path.basename(filePath)}@${startLine})`
        : name;
      fnMap[startLine] = {
        name: displayName,
        startLine,
        endLine,
        file: path.basename(filePath),
        paramsString: params
      };
    }
  }

  // Recursive walk of the AST
  function walkNode(node: any, parent: any) {
    switch (node.type) {
      case 'FunctionDeclaration': {
        const name = node.id ? node.id.name : '(anonymous)';
        const startLine = node.loc.start.line;
        const endLine = node.loc.end.line;
        const paramsString = node.params.map((p: any) => source.substring(p.start, p.end)).join(', ');
        recordFunction(name, startLine, endLine, `(${paramsString})`);
        break;
      }
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const startLine = node.loc.start.line;
        const endLine = node.loc.end.line;
        let name = '(anonymous)';
        // Infer name from parent nodes
        if (parent) {
          if (parent.type === 'VariableDeclarator' && parent.id?.name) {
            name = parent.id.name;
          } else if (parent.type === 'Property' && parent.key?.name) {
            name = parent.key.name;
          } else if (parent.type === 'AssignmentExpression' && parent.left?.property?.name) {
            name = parent.left.property.name;
          }
        }
        const paramsString = node.params?.map((p: any) => source.substring(p.start, p.end)).join(', ') || '';
        recordFunction(name, startLine, endLine, `(${paramsString})`);
        break;
      }
      case 'MethodDefinition': {
        // Handle class methods
        const name = node.key && node.key.name ? node.key.name : '(anonymous)';
        if (node.value && node.value.loc) {
          const startLine = node.value.loc.start.line;
          const endLine = node.value.loc.end.line;
          const paramsString = node.value.params?.map((p: any) => source.substring(p.start, p.end)).join(', ') || '';
          recordFunction(name, startLine, endLine, `(${paramsString})`);
        }
        break;
      }
      default:
        for (const key in node) {
          const child = node[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              child.forEach(c => walkNode(c, node));
            } else {
              walkNode(child, node);
            }
          }
        }
    }
  }

  walkNode(ast, null);
  return fnMap;
}

// Scan all .js and .ts files in the workspace folder and build a 'functionNameMap' organized by file name
export async function buildFunctionNameMapForWorkspace(workspacePath: string): Promise<Record<string, Record<number, FunctionInfo>>> {
  const masterMap: Record<string, Record<number, FunctionInfo>> = {};

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules folder
        if (entry.name === 'node_modules') continue;
        walkDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
        try {
          // Use relative path from workspace root, normalized to forward slashes
          const relPath = path.relative(workspacePath, fullPath).replace(/\\/g, '/');
          masterMap[relPath] = buildFunctionNameMapForFile(fullPath);
        } catch (err) {
          console.error('Error parsing file', fullPath, err);
        }
      }
    }
  }

  walkDir(workspacePath);
  return masterMap;
}
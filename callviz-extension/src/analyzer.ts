import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getJellyCommand } from './utils/config';
import { CallGraphData } from './graph/types';

export async function analyzeProjectWithJelly(workspacePath: string): Promise<CallGraphData | null> {
  const jellyCmd = getJellyCommand();
  const cgJsonPath = path.join(workspacePath, 'cg.json');
  const analysisFlags = \`-j \${cgJsonPath}\`;
  const cmd = \`\${jellyCmd} \${analysisFlags} \${workspacePath}\`;

  vscode.window.showInformationMessage(\`Running: \${cmd}\`);

  return new Promise((resolve) => {
    cp.exec(cmd, (error, stdout, stderr) => {
      if (error) {
        vscode.window.showErrorMessage(\`Jelly analysis failed: \${error.message}\`);
        return resolve(null);
      }

      if (!fs.existsSync(cgJsonPath)) {
        vscode.window.showErrorMessage(\`No call graph JSON file found at \${cgJsonPath}\`);
        return resolve(null);
      }

      const content = fs.readFileSync(cgJsonPath, 'utf-8');
      try {
        const graphData: CallGraphData = JSON.parse(content);
        resolve(graphData);
      } catch (parseError) {
        vscode.window.showErrorMessage(\`Failed to parse call graph JSON: \${parseError}\`);
        resolve(null);
      }
    });
  });
}

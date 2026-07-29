import * as vscode from 'vscode';
import { analyzeProjectWithJelly } from './analyzer';
import { buildFunctionNameMapForWorkspace } from './parsers';
import { generateEvaluationReport } from './evaluator';
import { transformToCytoscapeElements } from './graph/transformer';
import { showCallGraphWebView } from './webview/webviewProvider';

export function activate(context: vscode.ExtensionContext) {
  const analyzeProjectCommand = vscode.commands.registerCommand('callviz.analyzeProject', async () => {
    await runAnalysis(context);
  });

  context.subscriptions.push(analyzeProjectCommand);
}

export function deactivate() {}

async function runAnalysis(context: vscode.ExtensionContext): Promise<void> {
  const overallStart = Date.now();
  
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder found. Please open a folder or workspace first.');
    return;
  }
  const workspacePath = folders[0].uri.fsPath;

  try {
    const graphData = await analyzeProjectWithJelly(workspacePath);
    if (!graphData) {
      return; // Error already shown in analyzer
    }

    const masterFnMap = await buildFunctionNameMapForWorkspace(workspacePath);
    
    // Generate the eval report
    generateEvaluationReport(workspacePath, graphData, masterFnMap, overallStart);

    vscode.window.showInformationMessage('Jelly analysis completed. Preparing to visualize the call graph...');

    // Transform and show webview
    const elements = transformToCytoscapeElements(graphData, masterFnMap);
    const filesArray = graphData.files || [];
    showCallGraphWebView(context, elements, filesArray);

  } catch (err) {
    vscode.window.showErrorMessage(\`Exception during analysis: \${(err as Error).message}\`);
  }
}

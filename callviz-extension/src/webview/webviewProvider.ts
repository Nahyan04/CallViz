import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getWebviewContentCytoscape } from './template';
import { CytoscapeElement } from '../graph/types';

export function showCallGraphWebView(
  context: vscode.ExtensionContext, 
  elements: CytoscapeElement[], 
  filesArray: string[]
) {
  const panel = vscode.window.createWebviewPanel(
    'callViz',
    'Call Graph Visualization',
    vscode.ViewColumn.Two,
    { 
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview', 'assets'))]
    }
  );

  const cssPath = vscode.Uri.file(
    path.join(context.extensionPath, 'src', 'webview', 'assets', 'webview.css')
  );
  const cssUri = panel.webview.asWebviewUri(cssPath);

  panel.webview.html = getWebviewContentCytoscape(elements, cssUri, filesArray);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.command === 'openFunction' || message.command === 'openFunctionSplit') {
      const { file, startLine } = message;
      if (file && typeof startLine === 'number') {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) return;
        const workspacePath = folders[0].uri.fsPath;
        const absPath = path.isAbsolute(file) ? file : path.join(workspacePath, file);
        try {
          const doc = await vscode.workspace.openTextDocument(absPath);
          const openEditor = vscode.window.visibleTextEditors.find(
            ed => ed.document.uri.fsPath === absPath
          );
          let editor;
          if (openEditor) {
            editor = await vscode.window.showTextDocument(openEditor.document, openEditor.viewColumn, false);
          } else {
            editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
          }
          if (editor) {
            const pos = new vscode.Position(Math.max(0, startLine - 1), 0);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(pos, pos);
          }
        } catch (err) {
          vscode.window.showErrorMessage('Could not open file: ' + absPath);
        }
      }
    }
    
    if (message.command === 'savePng') {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
      }
      const workspacePath = folders[0].uri.fsPath;
      const filePath = path.join(workspacePath, 'call-graph.png');
      const base64 = message.data.replace(/^data:image\\/png;base64,/, '');
      fs.writeFile(filePath, base64, 'base64', (err) => {
        if (err) {
          vscode.window.showErrorMessage('Failed to save PNG: ' + err.message);
        } else {
          vscode.window.showInformationMessage('Call graph PNG saved to: ' + filePath);
        }
      });
    }
  });
}

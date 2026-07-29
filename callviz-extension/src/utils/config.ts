import * as vscode from 'vscode';

export function getJellyCommand(): string {
  const config = vscode.workspace.getConfiguration();
  return config.get<string>('callviz.jellyCommand') || 'jelly';
}

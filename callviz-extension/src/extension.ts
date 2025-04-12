// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Register the "callviz.analyzeProject" command
	const analyzeProjectCommand = vscode.commands.registerCommand('callviz.analyzeProject', async () => {
		// This function is called when the user selects "CallViz: Analyze Project"
		await analyzeWithJelly();
	  });
	
	  context.subscriptions.push(analyzeProjectCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function analyzeWithJelly(): Promise<void> {
	try {
	  // 1. Get user workspace folder (or ask user for a file)
	  const folders = vscode.workspace.workspaceFolders;
	  if (!folders || folders.length === 0) {
		vscode.window.showErrorMessage('No workspace folder found. Please open a folder or workspace first.');
		return;
	  }
	  // For simplicity, assume the first workspace folder is where we run analysis
	  const workspacePath = folders[0].uri.fsPath;
  
	  // 2. Retrieve settings (the user can customize them in VS Code)
	  const config = vscode.workspace.getConfiguration();
	  const jellyCmd = config.get<string>('callviz.jellyCommand') || 'jelly'; // IMPLEMENT DOCKER JELLY CALL LATER**
	  //const analysisFlags = config.get<string>('callviz.analysisFlags') || '-j cg.json';
	  const cgJsonPath = path.join(workspacePath, 'cg.json');
	  const analysisFlags = `-j ${cgJsonPath}`; // <-- modified to use absolute path

	  // 3. Construct a command to run
	  const cmd = `${jellyCmd} ${analysisFlags} ${workspacePath}`;
  
	  vscode.window.showInformationMessage(`Running: ${cmd}`);
  
	  // 4. Spawn or exec Jelly
	  cp.exec(cmd, (error, stdout, stderr) => {
		if (error) {
		  vscode.window.showErrorMessage(`Jelly analysis failed: ${error.message}`);
		  return;
		}
  
		if (!fs.existsSync(cgJsonPath)) {
		  vscode.window.showErrorMessage(`No call graph JSON file found at ${cgJsonPath}`);
		  return;
		}
  
		// 5. Read the JSON file
		const content = fs.readFileSync(cgJsonPath, 'utf-8');
		let graphData: any;
		try {
		  graphData = JSON.parse(content);
		} catch (parseError) {
		  vscode.window.showErrorMessage(`Failed to parse call graph JSON: ${parseError}`);
		  return;
		}
  
		// 6. Show a success message
		vscode.window.showInformationMessage('Jelly analysis completed. Preparing to visualize the call graph...');
  
		// 7. (Next step) Provide the data to a WebView or store it for further processing.
		// For now, we’ll just log the number of nodes/edges, if it has them:
		if (graphData && graphData.nodes && graphData.edges) {
		  vscode.window.showInformationMessage(`Call graph has ${graphData.nodes.length} nodes and ${graphData.edges.length} edges.`);
		}
	  });
	} catch (err) {
	  vscode.window.showErrorMessage(`Exception during analysis: ${(err as Error).message}`);
	}
  }

// Core VS Code APIs and node modules
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Local utility to parse and map function metadata from source files
import { buildFunctionNameMapForWorkspace } from './functionParser'

export function activate(context: vscode.ExtensionContext) {

	// Register the "callviz.analyzeProject" command
	const analyzeProjectCommand = vscode.commands.registerCommand('callviz.analyzeProject', async () => {
		// This function is called when the user selects "CallViz: Analyze Project"
		await analyzeWithJelly(context);
	  });
	
	  context.subscriptions.push(analyzeProjectCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function analyzeWithJelly(context: vscode.ExtensionContext): Promise<void> {
	try {
	  // Get the current workspace directory
	  const folders = vscode.workspace.workspaceFolders;
	  if (!folders || folders.length === 0) {
		vscode.window.showErrorMessage('No workspace folder found. Please open a folder or workspace first.');
		return;
	  }
	  const workspacePath = folders[0].uri.fsPath;
  
	  // Load user-defined Jelly path or fallback to 'jelly'
	  const config = vscode.workspace.getConfiguration();
	  const jellyCmd = config.get<string>('callviz.jellyCommand') || 'jelly'; // IMPLEMENT DOCKER JELLY CALL LATER**

	  // Generate absolute path to cg.json output
	  const cgJsonPath = path.join(workspacePath, 'cg.json');
	  const analysisFlags = -j ${cgJsonPath}; // <-- modified to use absolute path
	  const cmd = ${jellyCmd} ${analysisFlags} ${workspacePath};
  
	  vscode.window.showInformationMessage(Running: ${cmd});
  
	  // Run Jelly and wait for it to complete
	  cp.exec(cmd, async (error, stdout, stderr) => {
		if (error) {
		  vscode.window.showErrorMessage(Jelly analysis failed: ${error.message});
		  return;
		}
  
		if (!fs.existsSync(cgJsonPath)) {
		  vscode.window.showErrorMessage(No call graph JSON file found at ${cgJsonPath});
		  return;
		}
		 // Parse all source files to build a function name map for better labels
		 const masterFnMap = await buildFunctionNameMapForWorkspace(workspacePath);

		// Load the call graph JSON
		const content = fs.readFileSync(cgJsonPath, 'utf-8');
		let graphData: any;
		try {
		  graphData = JSON.parse(content);
		} catch (parseError) {
		  vscode.window.showErrorMessage(Failed to parse call graph JSON: ${parseError});
		  return;
		}
  
		vscode.window.showInformationMessage('Jelly analysis completed. Preparing to visualize the call graph...');
  
		// Provide data to WebView
		showCallGraphWebView(context, graphData, masterFnMap);      
	  });
	} catch (err) {
	  vscode.window.showErrorMessage(Exception during analysis: ${(err as Error).message});
	}
  }
  // Launch a new WebView panel and inject the Cytoscape-based visualization
  function showCallGraphWebView(context: vscode.ExtensionContext, graphData: any, masterFnMap: any) {
	
	const panel = vscode.window.createWebviewPanel(
	  'callViz',
	  'Call Graph Visualization',
	  vscode.ViewColumn.Two,
	  { enableScripts: true }
	);
	panel.webview.html = getWebviewContentCytoscape(graphData, masterFnMap);
  }

  function getWebviewContentCytoscape(
  jellyData: any,
  masterFnMap: Record<string, Record<number, { name: string; startLine: number; endLine: number; file: string; paramsString: string; }>>
): string {
  return `
	<!DOCTYPE html>
	<html>
	  <head>
		<meta charset="UTF-8" />
		<style>
		  body, html {
			margin: 0;
			padding: 0;
			width: 100%;
			height: 100%;
			background: #1e1e1e;
			font-family: sans-serif;
			position: relative;
		  }
		  #cy {
			width: 100%;
			height: 100%;
		  }
		  #tooltip {
			position: absolute;
			display: none;
			background-color: rgba(0, 0, 0, 0.75);
			color: #fff;
			padding: 6px 8px;
			border-radius: 4px;
			font-size: 13px;
			pointer-events: none;
			max-width: 250px;
			z-index: 999;
		  }
		</style>
		<script src="https://unpkg.com/cytoscape@3.24.0/dist/cytoscape.min.js"></script>
	  </head>
	  <body>
		<div id="cy"></div>
		<div id="tooltip"></div>
		<script>
		  // Embed the Jelly data and the Acorn function map
		  const jellyData = ${JSON.stringify(jellyData)};
		  const masterFnMap = ${JSON.stringify(masterFnMap)};
  
		  // Get list of files from Jelly output.
		  const filesArray = jellyData.files || [];
  
		  // Builds set of function IDs based on fun2fun and call2fun (from Jelly cg.json)
		  const usedFunctionIDs = new Set();
		  if (jellyData.fun2fun) {
			jellyData.fun2fun.forEach(([src, tgt]) => {
			  usedFunctionIDs.add(src);
			  usedFunctionIDs.add(tgt);
			});
		  }
		  if (jellyData.call2fun) {
			jellyData.call2fun.forEach(([callId, funcId]) => {
			  usedFunctionIDs.add(funcId);
			});
		  }
  
		  // Builds mapping from callId to target function id using call2fun
		  const callToFunctionMap = {};
		  if(jellyData.call2fun) {
			jellyData.call2fun.forEach(([callId, funcId]) => {
			  callToFunctionMap[callId] = funcId;
			});
		  }
  
		  // Helper to parse Jelly label to more redeable format
		  function parseJellyLabel(label) {
			const parts = label.split(':').map(x => parseInt(x, 10));
			if (parts.length !== 5) {
			  return null;
			}
			const [fileIndex, startLine, startCol, endLine, endCol] = parts;
			const fileName = filesArray[fileIndex] || 'unknown';
			return { fileName, startLine, startCol, endLine, endCol };
		  }
  
		  // Cytoscape elements array
		  const elements = [];
		  if (jellyData.functions) {
			for (const funcIdStr in jellyData.functions) {
			  const funcId = parseInt(funcIdStr, 10);
			  const rawLabel = jellyData.functions[funcIdStr];
			  const parsedLabel = parseJellyLabel(rawLabel);
  
			  // Look up function info by file and startLine
			  let fnInfo = null;
			  if (parsedLabel) {
				const fileMap = masterFnMap[parsedLabel.fileName];
				if (fileMap) {
				  fnInfo = fileMap[parsedLabel.startLine];
				}
			  }
			  let displayName = fnInfo ? (fnInfo.name + fnInfo.paramsString) : 'Function @ ' + rawLabel;
			  let locationInfo = fnInfo ? (fnInfo.file + ': ' + fnInfo.startLine + '–' + fnInfo.endLine) : 'Unknown Location';
			  const reachable = usedFunctionIDs.has(funcId) ? 'Reachable' : 'Not Reachable';
  
			  elements.push({
				data: {
				  id: 'f' + funcIdStr,
				  type: 'function',
				  reachable: reachable,
				  displayName: displayName,
				  locationInfo: locationInfo
				}
			  });
			}
		  }
		  // Process call nodes
		  if (jellyData.calls) {
			for (const callIdStr in jellyData.calls) {
			  const rawLabel = jellyData.calls[callIdStr];
			  const parsedLabel = parseJellyLabel(rawLabel);
			  let displayName = 'Call Site';
			  let locationInfo = rawLabel;
			  const callId = parseInt(callIdStr, 10);
  
			  // Use callToFunctionMap to find the target function
			  if (callToFunctionMap[callId] !== undefined) {
				const targetFuncId = callToFunctionMap[callId];
				const rawFuncLabel = jellyData.functions[targetFuncId];
				const parsedFuncLabel = parseJellyLabel(rawFuncLabel);
				if (parsedFuncLabel) {
				  const fileMap = masterFnMap[parsedFuncLabel.fileName];
				  if (fileMap && fileMap[parsedFuncLabel.startLine]) {
					displayName = 'Call of ' + fileMap[parsedFuncLabel.startLine].name;
					locationInfo = fileMap[parsedFuncLabel.startLine].file + ': ' + parsedFuncLabel.startLine + '–' + parsedFuncLabel.endLine;
				  }
				}
			  } else if (parsedLabel) {
				// Fallback
				const fileMap = masterFnMap[parsedLabel.fileName];
				if (fileMap && fileMap[parsedLabel.startLine]) {
				  displayName = 'Call of ' + fileMap[parsedLabel.startLine].name;
				  locationInfo = fileMap[parsedLabel.startLine].file + ': ' + parsedLabel.startLine + '–' + parsedLabel.endLine;
				}
			  }
  
			  elements.push({
				data: {
				  id: 'c' + callIdStr,
				  type: 'call',
				  reachable: 'N/A',
				  displayName: displayName,
				  locationInfo: locationInfo
				}
			  });
			}
		  }
		  // Build edges from fun2fun
		  if (jellyData.fun2fun) {
			jellyData.fun2fun.forEach(([src, tgt]) => {
			  elements.push({
				data: {
				  id: 'f' + src + '-f' + tgt,
				  source: 'f' + src,
				  target: 'f' + tgt,
				  asyncOrExternal: false
				}
			  });
			});
		  }
		  // Build edges from call2fun
		  if (jellyData.call2fun) {
			jellyData.call2fun.forEach(([callId, funcId]) => {
			  elements.push({
				data: {
				  id: 'c' + callId + '-f' + funcId,
				  source: 'c' + callId,
				  target: 'f' + funcId,
				  asyncOrExternal: false
				}
			  });
			});
		  }
  
		  // Initialize Cytoscape
		  const cy = cytoscape({
			container: document.getElementById('cy'),
			elements: elements,
			layout: {
			  name: 'cose',
			  animate: true
			},
			style: [
			  // Function nodes as squares
			  {
				selector: 'node[type="function"]',
				style: {
				  'shape': 'square',
				  'background-color': '#007acc',
				  'label': 'data(displayName)',
				  'font-size': '10px',
				  'color': '#fff',
				  'text-outline-color': '#007acc',
				  'text-outline-width': 2
				}
			  },
			  // Call nodes as green circles
			  {
				selector: 'node[type="call"]',
				style: {
				  'shape': 'ellipse',
				  'background-color': 'green',
				  'label': 'data(displayName)',
				  'font-size': '10px',
				  'color': '#fff',
				  'text-outline-color': 'green',
				  'text-outline-width': 2
				}
			  },
			  // Edges with arrowheads
			  {
				selector: 'edge',
				style: {
				  'width': 2,
				  'line-color': '#cccccc',
				  'target-arrow-color': '#cccccc',
				  'target-arrow-shape': 'triangle',
				  'arrow-scale': 1.2,
				  'curve-style': 'bezier'
				}
			  },
			  {
				selector: 'edge[asyncOrExternal = "true"]',
				style: {
				  'line-style': 'dashed'
				}
			  }
			]
		  });
  
		  // Tooltip logic
		  const tooltip = document.getElementById('tooltip');
		  let tappedNode = null;
  
		  // show tooltip and highlight connected edges on mouse hover**
		  cy.on('mouseover', 'node', (evt) => {
			tappedNode = evt.target;
			const d = tappedNode.data();
			const tooltipText = \
			  <strong>\${d.type === 'function' ? 'Function' : 'Call'}:</strong> \${d.displayName}<br>
			  <strong>Location:</strong> \${d.locationInfo}<br>
			  <strong>Reachable:</strong> \${d.reachable}
			\;
			tooltip.innerHTML = tooltipText;
			tooltip.style.display = 'block';
  
			// Highlight connected edges
			tappedNode.connectedEdges().forEach(edge => {
			  edge.style('line-color', '#ffeb3b');
			  edge.style('target-arrow-color', '#ffeb3b');
			});
		  });
  
		  cy.on('mouseout', 'node', (evt) => {
			tooltip.style.display = 'none';
			if (tappedNode) {
			  tappedNode.connectedEdges().forEach(edge => {
				edge.removeStyle('line-color');
				edge.removeStyle('target-arrow-color');
			  });
			  tappedNode = null;
			}
		  });
  
		  // Update tooltip position with mouse move
		  cy.on('mousemove', (evt) => {
			if (!tappedNode) return;
			const pos = cy.renderer().projectIntoViewport(evt.position.x, evt.position.y);
			const rect = cy.container().getBoundingClientRect();
			tooltip.style.left = (rect.left + pos[0] + 5) + 'px';
			tooltip.style.top = (rect.top + pos[1] + 5) + 'px';
		  });
		</script>
	  </body>
	</html>
	`;
}
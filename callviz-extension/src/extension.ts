// Core VS Code APIs and node modules
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Local utility to parse and map function metadata from source files
import { buildFunctionNameMapForWorkspace } from './functionParser';

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
	const overallStart = Date.now();
	const perFileStats: Record<string, any> = {};
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
	  const analysisFlags = `-j ${cgJsonPath}`; // <-- modified to use absolute path
	  const cmd = `${jellyCmd} ${analysisFlags} ${workspacePath}`;
  
	  vscode.window.showInformationMessage(`Running: ${cmd}`);
  
	  // Run Jelly and wait for it to complete
	  cp.exec(cmd, async (error, stdout, stderr) => {
		if (error) {
		  vscode.window.showErrorMessage(`Jelly analysis failed: ${error.message}`);
		  return;
		}
  
		if (!fs.existsSync(cgJsonPath)) {
		  vscode.window.showErrorMessage(`No call graph JSON file found at ${cgJsonPath}`);
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
		  vscode.window.showErrorMessage(`Failed to parse call graph JSON: ${parseError}`);
		  return;
		}
  
		// --- Per-file metrics ---
		const files = graphData.files || [];
		const functions = graphData.functions || {};
		const calls = graphData.calls || {};
		const fun2fun = graphData.fun2fun || [];
		const call2fun = graphData.call2fun || [];
		// Build incoming edge count for each function
		const incomingCount: Record<string, number> = {};
		fun2fun.forEach(([src, tgt]: [any, any]) => {
		  incomingCount[tgt] = (incomingCount[tgt] || 0) + 1;
		});
		// For each file, gather stats
		for (const file of files) {
		  const fileStart = Date.now();
		  // AST function count
		  const astFuncs = masterFnMap[file] ? Object.keys(masterFnMap[file]).length : 0;
		  // Graph function node count
		  const graphFuncs = Object.entries(functions).filter(([fid, label]) => {
			const parts = String(label).split(':');
			return files[parseInt(parts[0], 10)] === file;
		  }).length;
		  // Call-site node count
		  const callSites = Object.entries(calls).filter(([cid, label]) => {
			const parts = String(label).split(':');
			return files[parseInt(parts[0], 10)] === file;
		  }).length;
		  // Dead function count (zero incoming edges)
		  const fileFuncIds = Object.entries(functions).filter(([fid, label]) => {
			const parts = String(label).split(':');
			return files[parseInt(parts[0], 10)] === file;
		  }).map(([fid]) => fid);
		  const deadFuncs = fileFuncIds.filter(fid => !incomingCount[fid]).length;
		  const fileTime = Date.now() - fileStart;
		  perFileStats[file] = {
			time: fileTime,
			astFuncs,
			graphFuncs,
			callSites,
			deadFuncs
		  };
		}
		const overallTime = Date.now() - overallStart;
		// --- Write report ---
		let report = '';
		report += 'CallViz Evaluation Report\n';
		report += '=========================\n\n';
		report += 'OVERALL\n-------\n';
		report += `Total time:       ${overallTime} ms\n\n`;
		report += 'PER-FILE\n--------\n';
		for (const file of files) {
		  const stats = perFileStats[file];
		  report += `${file}:\n`;
		  report += `  Time:            ${stats.time} ms\n`;
		  report += `  AST funcs:       ${stats.astFuncs}\n`;
		  report += `  Graph funcs:     ${stats.graphFuncs}\n`;
		  report += `  Call-site nodes: ${stats.callSites}\n`;
		  report += `  Dead funcs:      ${stats.deadFuncs}\n\n`;
		}
		const evalPath = path.join(workspacePath, 'callviz-eval.txt');
		fs.writeFileSync(evalPath, report, 'utf-8');
		vscode.window.showInformationMessage('CallViz evaluation report written to callviz-eval.txt');

		vscode.window.showInformationMessage('Jelly analysis completed. Preparing to visualize the call graph...');
  
		// Provide data to WebView
		showCallGraphWebView(context, graphData, masterFnMap);      
	  });
	} catch (err) {
	  vscode.window.showErrorMessage(`Exception during analysis: ${(err as Error).message}`);
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

	// Listen for messages from the webview
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
			// Check if the file is already open in any visible editor
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
		// Save PNG to workspace directory as call-graph.png
		const folders = vscode.workspace.workspaceFolders;
		if (!folders) {
		  vscode.window.showErrorMessage('No workspace folder found.');
		  return;
		}
		const workspacePath = folders[0].uri.fsPath;
		const filePath = path.join(workspacePath, 'call-graph.png');
		const base64 = message.data.replace(/^data:image\/png;base64,/, '');
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
		  html, body {
			margin: 0;
			padding: 0;
			width: 100vw;
			height: 100vh;
			background: #1e1e1e;
			font-family: sans-serif;
			position: relative;
			overflow: hidden;
		  }
		  #search-container {
			width: 100%;
			background: #222;
			padding: 10px 0 5px 0;
			text-align: center;
			z-index: 10;
			position: relative;
		  }
		  #search-box {
			width: 300px;
			padding: 6px 10px;
			border-radius: 4px;
			border: none;
			font-size: 15px;
			background: #333;
			color: #fff;
		  }
		  #export-png {
			margin-left: 20px;
			padding: 6px 14px;
			border-radius: 4px;
			border: none;
			background: #007acc;
			color: #fff;
			font-size: 14px;
			cursor: pointer;
			transition: background 0.2s;
		  }
		  #export-png:hover {
			background: #005fa3;
		  }
		  #file-filter-container {
			width: 100%;
			text-align: center;
			margin: 8px 0 0 0;
		  }
		  #file-filter {
			min-width: 220px;
			max-width: 400px;
			padding: 4px 8px;
			border-radius: 4px;
			background: #222;
			color: #fff;
			font-size: 15px;
			border: 1px solid #444;
		  }
		  #cy {
			width: 100vw;
			height: calc(100vh - 55px);
			min-height: 400px;
			display: block;
		  }
		  #tooltip {
			position: absolute;
			display: none;
			background-color: rgba(0, 0, 0, 0.85);
			color: #fff;
			padding: 6px 8px;
			border-radius: 4px;
			font-size: 13px;
			pointer-events: none;
			max-width: 350px;
			z-index: 999;
			box-shadow: 0 2px 8px #000a;
		  }
		  #sidebar {
			position: absolute;
			top: 60px;
			right: 0;
			width: 320px;
			min-height: 120px;
			background: #23272e;
			color: #fff;
			border-radius: 8px 0 0 8px;
			box-shadow: -2px 0 12px #000a;
			z-index: 1000;
			padding: 18px 20px 18px 20px;
			display: none;
			font-size: 15px;
			transition: box-shadow 0.2s;
		  }
		  #sidebar h3 {
			margin: 0 0 10px 0;
			font-size: 18px;
			color: #7ecfff;
		  }
		  #sidebar .sidebar-row {
			margin-bottom: 8px;
		  }
		</style>
		<script src="https://unpkg.com/cytoscape@3.24.0/dist/cytoscape.min.js"></script>
	  </head>
	  <body>
		<div id="search-container">
		  <input id="search-box" type="text" placeholder="Search function/call name..." />
		  <label for="toggle-dead" style="color:#fff;font-size:14px;">
			<input id="toggle-dead" type="checkbox" checked /> Show unreachable (dead) functions
		  </label>
		  <button id="export-png">Export as PNG</button>
		</div>
		<div id="file-filter-container" style="width:100%;text-align:center;margin:8px 0 0 0;">
		  <select id="file-filter" multiple size="3" style="min-width:220px;max-width:400px;padding:4px 8px;border-radius:4px;background:#222;color:#fff;font-size:15px;border:1px solid #444;">
		  </select>
		  <span style="color:#aaa;font-size:13px;margin-left:8px;">(Filter by file: hold Ctrl/Cmd to multi-select)</span>
		</div>
		<div id="cy"></div>
		<div id="tooltip"></div>
		<script>
		  const vscode = acquireVsCodeApi();
		  // DEBUG: Log to ensure script is running
		  console.log('Webview script loaded!');

		  // Embed the Jelly data and the Acorn function map
		  const jellyData = ${JSON.stringify(jellyData)};
		  const masterFnMap = ${JSON.stringify(masterFnMap)};

		  // Defensive: If no data, show message
		  if (!jellyData || !jellyData.functions) {
			document.getElementById('cy').innerHTML = '<div style="color:#fff;text-align:center;padding:40px;">No call graph data found.</div>';
		  } else {
			// Get list of files from Jelly output.
			const filesArray = jellyData.files || [];

			// Builds set of function IDs based on fun2fun and call2fun (from Jelly cg.json)
			const usedFunctionIDs = new Set();
			const reachableFunctions = new Set();

			// First pass: collect all functions that are called directly
			if (jellyData.call2fun) {
			  jellyData.call2fun.forEach(([callId, funcId]) => {
				reachableFunctions.add(funcId);
			  });
			}

			// Second pass: recursively mark functions that are called by reachable functions
			function markReachable(funcId) {
			  if (reachableFunctions.has(funcId)) return;
			  reachableFunctions.add(funcId);
			  if (jellyData.fun2fun) {
				jellyData.fun2fun.forEach(([src, tgt]) => {
				  if (src === funcId) {
					markReachable(tgt);
				  }
				});
			  }
			}
			Array.from(reachableFunctions).forEach(funcId => markReachable(funcId));

			// Builds mapping from callId to target function id using call2fun
			const callToFunctionMap = {};
			if(jellyData.call2fun) {
			  jellyData.call2fun.forEach(([callId, funcId]) => {
				callToFunctionMap[callId] = funcId;
			  });
			}

			// Helper to parse Jelly label to more readable format
			function parseJellyLabel(label) {
			  const parts = label.split(':').map(x => parseInt(x, 10));
			  if (parts.length !== 5) {
				return null;
			  }
			  const [fileIndex, startLine, startCol, endLine, endCol] = parts;
			  const fileName = filesArray[fileIndex] || 'unknown';
			  return { fileName, startLine, startCol, endLine, endCol };
			}

			// Helper to find the best matching function info
			function findBestMatchingFunction(fileName, startLine) {
			  // Try exact filename match first
			  let fileMap = masterFnMap[fileName];
			  
			  // If not found, try matching just the basename
			  if (!fileMap) {
				const baseName = fileName.split('/').pop();
				for (const key in masterFnMap) {
				  if (key.endsWith('/' + baseName) || key === baseName) {
					fileMap = masterFnMap[key];
					break;
				  }
				}
			  }
			  
			  if (!fileMap) {
				console.log('No file map found for:', fileName);
				return null;
			  }
			  
			  // First try exact match
			  if (fileMap[startLine]) {
				return fileMap[startLine];
			  }
			  
			  // If no exact match, find the closest function that contains this line
			  let bestMatch = null;
			  let minDistance = Infinity;
			  
			  for (const line in fileMap) {
				const fn = fileMap[line];
				if (startLine >= fn.startLine && startLine <= fn.endLine) {
				  const distance = Math.abs(startLine - fn.startLine);
				  if (distance < minDistance) {
					minDistance = distance;
					bestMatch = fn;
				  }
				}
			  }
			  
			  if (!bestMatch) {
				console.log('No function match found for:', fileName, 'at line', startLine);
			  }
			  
			  return bestMatch;
			}

			// Helper to truncate labels
			function truncateLabel(label) {
			  return label.length > 20 ? label.slice(0, 17) + '…' : label;
			}

			// Debug: Log the master function map
			console.log('Master function map:', masterFnMap);

			// Helper to check if a file should be excluded
			function shouldExcludeFile(fileName) {
			  return fileName.includes('/test/') || 
					 fileName.includes('/tests/') || 
					 fileName.includes('/__tests__/') ||
					 fileName.startsWith('test/') ||
					 fileName.endsWith('.test.js') ||
					 fileName.endsWith('.spec.js');
			}

			// Cytoscape elements array
			const elements = [];
			if (jellyData.functions) {
			  for (const funcIdStr in jellyData.functions) {
				const funcId = parseInt(funcIdStr, 10);
				const rawLabel = jellyData.functions[funcIdStr];
				const parsedLabel = parseJellyLabel(rawLabel);
				
				// Skip test files
				if (parsedLabel && shouldExcludeFile(parsedLabel.fileName)) {
				  continue;
				}
				
				let fnInfo = null;
				let displayName = 'Unknown Function';
				let locationInfo = rawLabel;
				
				if (parsedLabel) {
				  console.log('Processing function:', parsedLabel.fileName, 'at line', parsedLabel.startLine);
				  fnInfo = findBestMatchingFunction(parsedLabel.fileName, parsedLabel.startLine);
				  if (fnInfo) {
					displayName = fnInfo.name + fnInfo.paramsString;
					locationInfo = fnInfo.file + ': ' + fnInfo.startLine + '–' + fnInfo.endLine;
				  } else {
					// If no function info found, create a more descriptive label
					displayName = 'Function in ' + parsedLabel.fileName + '@' + parsedLabel.startLine;
					locationInfo = parsedLabel.fileName + ': ' + parsedLabel.startLine + '–' + parsedLabel.endLine;
				  }
				}
				
				const reachable = reachableFunctions.has(funcId) ? 'Reachable' : 'Not Reachable';
				elements.push({
				  data: {
					id: 'f' + funcIdStr,
					type: 'function',
					reachable: reachable,
					displayName: displayName,
					truncatedLabel: truncateLabel(displayName),
					fullLabel: displayName,
					locationInfo: locationInfo,
					file: fnInfo ? fnInfo.file : parsedLabel?.fileName,
					startLine: fnInfo ? fnInfo.startLine : parsedLabel?.startLine,
					jellyId: funcIdStr
				  }
				});
			  }
			}
			
			// Also filter out test files from call nodes
			if (jellyData.calls) {
			  for (const callIdStr in jellyData.calls) {
				const rawLabel = jellyData.calls[callIdStr];
				const parsedLabel = parseJellyLabel(rawLabel);
				
				// Skip test files
				if (parsedLabel && shouldExcludeFile(parsedLabel.fileName)) {
				  continue;
				}
				
				let displayName = 'Call Site';
				let locationInfo = rawLabel;
				const callId = parseInt(callIdStr, 10);
				elements.push({
				  data: {
					id: 'c' + callIdStr,
					type: 'call',
					reachable: 'N/A',
					displayName: displayName,
					truncatedLabel: truncateLabel(displayName),
					fullLabel: displayName,
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
					'label': 'data(truncatedLabel)',
					'font-size': '10px',
					'color': '#fff',
					'text-outline-color': '#007acc',
					'text-outline-width': 2
				  }
				},
				// Unreachable function nodes as gray squares, dashed border, lower opacity
				{
				  selector: 'node[type="function"][reachable="Not Reachable"]',
				  style: {
					'background-color': '#666666',
					'text-outline-color': '#666666',
					'color': '#fff',
					'border-style': 'dashed',
					'border-width': 3,
					'border-color': '#bbb',
					'opacity': 0.4
				  }
				},
				// Highlighted nodes
				{
				  selector: 'node[?highlighted]',
				  style: {
					'border-width': 4,
					'border-color': '#ffeb3b',
					'border-style': 'solid',
					'opacity': 1
				  }
				},
				// Call nodes as green circles
				{
				  selector: 'node[type="call"]',
				  style: {
					'shape': 'ellipse',
					'background-color': 'green',
					'label': 'data(truncatedLabel)',
					'font-size': '10px',
					'color': '#fff',
					'text-outline-color': 'green',
					'text-outline-width': 2,
					'opacity': 0.5,
					'border-width': 0
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
				},
				// Add unresolved call site style
				{
				  selector: 'node[type="call"][unresolved = true]',
				  style: {
					'background-color': '#b71c1c',
					'border-color': '#ff5252',
					'border-width': 3,
					'opacity': 0.5
				  }
				},
				{
				  selector: 'node[type="call"][resolved = true]',
				  style: {
					'background-color': 'green',
					'text-outline-color': 'green',
					'color': '#fff',
					'opacity': 0.5
				  }
				},
				{
				  selector: '.callsite-hidden',
				  style: {
					'display': 'none'
				  }
				}
			  ]
			});

			// Populate file filter dropdown
			const fileFilter = document.getElementById('file-filter');
			filesArray.forEach(function(file) {
			  const opt = document.createElement('option');
			  opt.value = file;
			  opt.textContent = file;
			  opt.selected = true;
			  fileFilter.appendChild(opt);
			});

			// Helper to get selected files
			function getSelectedFiles() {
			  return Array.from(fileFilter.selectedOptions).map(opt => opt.value);
			}

			// Filtering logic for graph
			function updateFileFilter() {
			  const selected = new Set(getSelectedFiles());
			  cy.nodes().forEach(function(node) {
				const d = node.data();
				// Only filter if node has a file property (function nodes)
				if (d.type === 'function' && d.file) {
				  node.style('display', selected.has(d.file) ? 'element' : 'none');
				}
			  });
			  // For call site nodes: show if their target function is visible, otherwise hide
			  cy.nodes('node[type="call"]').forEach(function(node) {
				// Find the target function node (for call2fun edges)
				const outgoing = node.outgoers('edge[target][target^="f"]');
				let visible = false;
				outgoing.forEach(function(edge) {
				  const tgt = edge.target();
				  if (tgt && tgt.style('display') !== 'none') visible = true;
				});
				node.style('display', visible ? 'element' : 'none');
			  });
			  // Hide edges if either end is hidden
			  cy.edges().forEach(function(edge) {
				const src = edge.source();
				const tgt = edge.target();
				edge.style('display', (src.style('display') !== 'none' && tgt.style('display') !== 'none') ? 'element' : 'none');
			  });
			}
			fileFilter.addEventListener('change', updateFileFilter);
			// Initial call
			updateFileFilter();

			// Tooltip logic
			const tooltip = document.getElementById('tooltip');
			let tappedNode = null;
			let lastClickedNode = null;
			let lastHighlightedEdges = [];

			cy.on('mouseover', 'node', function(evt) {
			  tappedNode = evt.target;
			  const d = tappedNode.data();
			  // Compute incoming/outgoing edges and recursion for function nodes
			  let details = '';
			  if (d.type === 'function') {
				const node = tappedNode;
				const incoming = node.incomers('edge').filter(function(e) { return e.target().id() === node.id(); }).length;
				const outgoing = node.outgoers('edge').filter(function(e) { return e.source().id() === node.id(); }).length;
				let isRecursive = false;
				if (node.connectedEdges().some(function(e) { return e.source().id() === node.id() && e.target().id() === node.id(); })) {
				  isRecursive = true;
				} else {
				  const visited = new Set();
				  function dfs(nid) {
					if (visited.has(nid)) return false;
					visited.add(nid);
					const outs = cy.getElementById(nid).outgoers('node[type="function"]').map(function(n) { return n.id(); });
					for (var i = 0; i < outs.length; i++) {
					  if (outs[i] === node.id() || dfs(outs[i])) return true;
					}
					return false;
				  }
				  isRecursive = dfs(node.id());
				}
				const recColor = isRecursive ? '#ff5252' : '#7ecfff';
				const recText = isRecursive ? 'Yes' : 'No';
				details =
				  '<div style="font-weight:bold;font-size:17px;color:#7ecfff;margin-bottom:6px;">Function Details</div>' +
				  '<div><b>Name:</b> ' + d.fullLabel + '</div>' +
				  '<div><b>Location:</b> ' + d.locationInfo + '</div>' +
				  '<div><b>Incoming Edges:</b> ' + incoming + '</div>' +
				  '<div><b>Outgoing Edges:</b> ' + outgoing + '</div>' +
				  '<div><b>Recursive:</b> <span style="color:' + recColor + ';font-weight:bold;">' + recText + '</span></div>';
			  } else {
				details = '<strong>' + (d.type === 'function' ? 'Function' : 'Call') + ':</strong> ' + d.fullLabel + '<br>' +
				  '<strong>Location:</strong> ' + d.locationInfo + '<br>' +
				  '<strong>Reachable:</strong> ' + d.reachable;
			  }
			  tooltip.innerHTML = details;
			  tooltip.style.display = 'block';
			  // Position tooltip above the node
			  const nodeRenderedPos = tappedNode.renderedPosition();
			  const cyRect = cy.container().getBoundingClientRect();
			  tooltip.style.left = (cyRect.left + nodeRenderedPos.x - tooltip.offsetWidth / 2) + 'px';
			  tooltip.style.top = (cyRect.top + nodeRenderedPos.y - tooltip.offsetHeight - 12) + 'px';
			  // Highlight connected edges (yellow) on hover, unless node is also clicked
			  if (!lastClickedNode || tappedNode.id() !== lastClickedNode.id()) {
				tappedNode.connectedEdges().forEach(function(edge) {
				  edge.style('line-color', '#ffeb3b');
				  edge.style('target-arrow-color', '#ffeb3b');
				});
			  }
			});

			cy.on('mouseout', 'node', function(evt) {
			  tooltip.style.display = 'none';
			  if (tappedNode) {
				tappedNode.connectedEdges().forEach(function(edge) {
				  edge.removeStyle('line-color');
				  edge.removeStyle('target-arrow-color');
				});
				tappedNode = null;
			  }
			});

			// Update tooltip position on mouse move (keep above node)
			cy.on('mousemove', 'node', function(evt) {
			  if (!tappedNode) return;
			  const nodeRenderedPos = tappedNode.renderedPosition();
			  const cyRect = cy.container().getBoundingClientRect();
			  tooltip.style.left = (cyRect.left + nodeRenderedPos.x - tooltip.offsetWidth / 2) + 'px';
			  tooltip.style.top = (cyRect.top + nodeRenderedPos.y - tooltip.offsetHeight - 12) + 'px';
			});

			// TOGGLE DEAD FUNCTIONS
			const toggleDead = document.getElementById('toggle-dead');
			function updateDeadVisibility() {
			  const show = toggleDead.checked;
			  cy.nodes('node[type="function"][reachable!="Reachable"]').forEach(function(node) {
				node.style('display', show ? 'element' : 'none');
			  });
			  // Hide edges if either end is hidden
			  cy.edges().forEach(function(edge) {
				const src = edge.source();
				const tgt = edge.target();
				edge.style('display', (src.style('display') !== 'none' && tgt.style('display') !== 'none') ? 'element' : 'none');
			  });
			}
			toggleDead.addEventListener('change', updateDeadVisibility);
			// Initial call
			updateDeadVisibility();

			// SEARCH: filter/highlight nodes by name
			const searchBox = document.getElementById('search-box');
			searchBox.addEventListener('input', function() {
			  const query = this.value.trim().toLowerCase();
			  cy.nodes().forEach(function(node) {
				const label = node.data('fullLabel').toLowerCase();
				if (query && label.includes(query)) {
				  node.data('highlighted', true);
				} else {
				  node.data('highlighted', false);
				}
			  });
			});

			// EXPORT PNG BUTTON (send to extension to save)
			document.getElementById('export-png').addEventListener('click', function() {
			  try {
				const pngData = cy.png({ full: true, scale: 2, bg: '#1e1e1e' });
				vscode.postMessage({ command: 'savePng', data: pngData });
			  } catch (e) {
				alert('PNG export failed. Try resizing the window or refreshing the graph.');
			  }
			});

			// TAP/CLICK TO OPEN FUNCTION SOURCE and highlight edges
			cy.on('tap', 'node[type="function"]', function(evt) {
			  // Remove highlight from previous
			  if (lastClickedNode) {
				lastClickedNode.connectedEdges().forEach(function(edge) {
				  edge.removeStyle('line-color');
				  edge.removeStyle('target-arrow-color');
				});
			  }
			  const node = evt.target;
			  lastClickedNode = node;
			  node.connectedEdges().forEach(function(edge) {
				edge.style('line-color', '#ffeb3b');
				edge.style('target-arrow-color', '#ffeb3b');
			  });
			  const d = node.data();
			  if (d.file && d.startLine) {
				vscode.postMessage({ command: 'openFunctionSplit', file: d.file, startLine: d.startLine });
			  }
			});
		  }
		</script>
	  </body>
	</html>
	`;
}

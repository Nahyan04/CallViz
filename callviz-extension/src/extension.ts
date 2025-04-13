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
		await analyzeWithJelly(context);
	  });
	
	  context.subscriptions.push(analyzeProjectCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function analyzeWithJelly(context: vscode.ExtensionContext): Promise<void> {
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
  
		// 7. Provide the data to a WebView or store it for further processing.
		showCallGraphWebView(context, graphData);      
	  });
	} catch (err) {
	  vscode.window.showErrorMessage(`Exception during analysis: ${(err as Error).message}`);
	}
  }

  function showCallGraphWebView(context: vscode.ExtensionContext, graphData: any) {

    const panel = vscode.window.createWebviewPanel(
      'callViz', 
      'Call Graph Visualization',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
      }
    );
  
    // Set the HTML content for the panel
    panel.webview.html = getWebviewContent(graphData);
  }

  function getWebviewContent(graphData: any): string {  
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <script src="https://d3js.org/d3.v7.min.js"></script>
      <style>
        /* styling */
        body {
          font-family: sans-serif;
        }
        .node circle {
          fill: steelblue;
          stroke: #fff;
          stroke-width: 1.5px;
        }
        .link {
          stroke: #999;
          stroke-opacity: 0.6;
        }
        #graph {
          width: 100%;
          height: 100vh;
        }
      </style>
    </head>
    <body>
      <h2>Jelly Call Graph Visualization</h2>
      <div id="graph"></div>
  
      <script>
        // raw Jelly call graph data
        const jellyData = ${JSON.stringify(graphData)};
  
        // Convert the Jelly structure into D3-friendly arrays: nodes[] and links[].
        const nodes = [];
        const links = [];
  
        if (jellyData.functions) {
          for (const funcId in jellyData.functions) {
            nodes.push({
              id: 'f' + funcId,   // unique node ID, e.g. "f0"
              label: jellyData.functions[funcId],
              type: 'function'
            });
          }
        }
  
        // Extracts call IDs from jellyData.calls
        if (jellyData.calls) {
          for (const callId in jellyData.calls) {
            nodes.push({
              id: 'c' + callId,   // e.g. "c3"
              label: jellyData.calls[callId],
              type: 'call'
            });
          }
        }
  
        // helper function to get node ID string for function or call
        function funcNodeId(funcIndex) {
          return 'f' + funcIndex; 
        }
        function callNodeId(callIndex) {
          return 'c' + callIndex;
        }

        // Creates link
        if (jellyData.fun2fun) {
          jellyData.fun2fun.forEach(pair => {
            const [sourceFunc, targetFunc] = pair;
            links.push({
              source: funcNodeId(sourceFunc),
              target: funcNodeId(targetFunc)
            });
          });
        }
  
        if (jellyData.call2fun) {
          jellyData.call2fun.forEach(pair => {
            const [callIdx, funcIdx] = pair;
            links.push({
              source: callNodeId(callIdx),
              target: funcNodeId(funcIdx)
            });
          });
        }
  
        // setup
        const width = window.innerWidth;
        const height = window.innerHeight;
  
        const svg = d3.select("#graph")
          .append("svg")
          .attr("width", width)
          .attr("height", height);
  
        const simulation = d3.forceSimulation(nodes)
          .force("charge", d3.forceManyBody().strength(-300))
          .force("link", d3.forceLink(links).id(d => d.id).distance(150))
          .force("center", d3.forceCenter(width / 2, height / 2));
  
        const link = svg.selectAll(".link")
          .data(links)
          .enter().append("line")
          .attr("class", "link");
  
        const node = svg.selectAll(".node")
          .data(nodes)
          .enter().append("g")
          .attr("class", "node")
          .call(d3.drag()
            .on("start", dragStarted)
            .on("drag", dragged)
            .on("end", dragEnded));
  
        node.append("circle")
          .attr("r", 12)
          .style("fill", d => d.type === 'function' ? 'steelblue' : 'orange');
  
        node.append("title")
          .text(d => d.label);
  
        node.append("text")
          .attr("dy", -15)
          .attr("text-anchor", "middle")
          .text(d => d.id);
  
        simulation.on("tick", () => {
          link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
  
          node
            .attr("transform", d => "translate(" + d.x + "," + d.y + ")");
        });
  
        function dragStarted(event, d) {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        }
  
        function dragged(event, d) {
          d.fx = event.x;
          d.fy = event.y;
        }
  
        function dragEnded(event, d) {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }
      </script>
    </body>
    </html>
    `;
  }

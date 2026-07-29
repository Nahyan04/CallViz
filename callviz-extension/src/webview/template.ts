import * as vscode from 'vscode';
import { CytoscapeElement } from '../graph/types';

export function getWebviewContentCytoscape(
  elements: CytoscapeElement[],
  cssUri: vscode.Uri,
  filesArray: string[]
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <link href="${cssUri}" rel="stylesheet">
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
            ${filesArray.map(f => \`<option value="\${f}" selected>\${f}</option>\`).join('\n')}
          </select>
          <span style="color:#aaa;font-size:13px;margin-left:8px;">(Filter by file: hold Ctrl/Cmd to multi-select)</span>
        </div>
        <div id="cy"></div>
        <div id="tooltip"></div>
        <script>
          const vscode = acquireVsCodeApi();
          const elements = ${JSON.stringify(elements)};
          
          if (!elements || elements.length === 0) {
            document.getElementById('cy').innerHTML = '<div style="color:#fff;text-align:center;padding:40px;">No call graph data found.</div>';
          } else {
            const cy = cytoscape({
              container: document.getElementById('cy'),
              elements: elements,
              layout: {
                name: 'cose',
                animate: true
              },
              style: [
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
                {
                  selector: 'node[?highlighted]',
                  style: {
                    'border-width': 4,
                    'border-color': '#ffeb3b',
                    'border-style': 'solid',
                    'opacity': 1
                  }
                },
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

            const fileFilter = document.getElementById('file-filter');
            function getSelectedFiles() {
              return Array.from(fileFilter.selectedOptions).map(opt => opt.value);
            }

            function updateFileFilter() {
              const selected = new Set(getSelectedFiles());
              cy.nodes().forEach(function(node) {
                const d = node.data();
                if (d.type === 'function' && d.file) {
                  node.style('display', selected.has(d.file) ? 'element' : 'none');
                }
              });
              cy.nodes('node[type="call"]').forEach(function(node) {
                const outgoing = node.outgoers('edge[target][target^="f"]');
                let visible = false;
                outgoing.forEach(function(edge) {
                  const tgt = edge.target();
                  if (tgt && tgt.style('display') !== 'none') visible = true;
                });
                node.style('display', visible ? 'element' : 'none');
              });
              cy.edges().forEach(function(edge) {
                const src = edge.source();
                const tgt = edge.target();
                edge.style('display', (src.style('display') !== 'none' && tgt.style('display') !== 'none') ? 'element' : 'none');
              });
            }
            fileFilter.addEventListener('change', updateFileFilter);
            updateFileFilter();

            const tooltip = document.getElementById('tooltip');
            let tappedNode = null;
            let lastClickedNode = null;

            cy.on('mouseover', 'node', function(evt) {
              tappedNode = evt.target;
              const d = tappedNode.data();
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
                  '<div><b>Name:</b> ' + (d.fullLabel || '') + '</div>' +
                  '<div><b>Location:</b> ' + (d.locationInfo || '') + '</div>' +
                  '<div><b>Incoming Edges:</b> ' + incoming + '</div>' +
                  '<div><b>Outgoing Edges:</b> ' + outgoing + '</div>' +
                  '<div><b>Recursive:</b> <span style="color:' + recColor + ';font-weight:bold;">' + recText + '</span></div>';
              } else {
                details = '<strong>' + (d.type === 'function' ? 'Function' : 'Call') + ':</strong> ' + (d.fullLabel || '') + '<br>' +
                  '<strong>Location:</strong> ' + (d.locationInfo || '') + '<br>' +
                  '<strong>Reachable:</strong> ' + (d.reachable || '');
              }
              tooltip.innerHTML = details;
              tooltip.style.display = 'block';
              
              const nodeRenderedPos = tappedNode.renderedPosition();
              const cyRect = cy.container().getBoundingClientRect();
              tooltip.style.left = (cyRect.left + nodeRenderedPos.x - tooltip.offsetWidth / 2) + 'px';
              tooltip.style.top = (cyRect.top + nodeRenderedPos.y - tooltip.offsetHeight - 12) + 'px';
              
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

            cy.on('mousemove', 'node', function(evt) {
              if (!tappedNode) return;
              const nodeRenderedPos = tappedNode.renderedPosition();
              const cyRect = cy.container().getBoundingClientRect();
              tooltip.style.left = (cyRect.left + nodeRenderedPos.x - tooltip.offsetWidth / 2) + 'px';
              tooltip.style.top = (cyRect.top + nodeRenderedPos.y - tooltip.offsetHeight - 12) + 'px';
            });

            const toggleDead = document.getElementById('toggle-dead');
            function updateDeadVisibility() {
              const show = toggleDead.checked;
              cy.nodes('node[type="function"][reachable!="Reachable"]').forEach(function(node) {
                node.style('display', show ? 'element' : 'none');
              });
              cy.edges().forEach(function(edge) {
                const src = edge.source();
                const tgt = edge.target();
                edge.style('display', (src.style('display') !== 'none' && tgt.style('display') !== 'none') ? 'element' : 'none');
              });
            }
            toggleDead.addEventListener('change', updateDeadVisibility);
            updateDeadVisibility();

            const searchBox = document.getElementById('search-box');
            searchBox.addEventListener('input', function() {
              const query = this.value.trim().toLowerCase();
              cy.nodes().forEach(function(node) {
                const label = (node.data('fullLabel') || '').toLowerCase();
                if (query && label.includes(query)) {
                  node.data('highlighted', true);
                } else {
                  node.data('highlighted', false);
                }
              });
            });

            document.getElementById('export-png').addEventListener('click', function() {
              try {
                const pngData = cy.png({ full: true, scale: 2, bg: '#1e1e1e' });
                vscode.postMessage({ command: 'savePng', data: pngData });
              } catch (e) {
                alert('PNG export failed. Try resizing the window or refreshing the graph.');
              }
            });

            cy.on('tap', 'node[type="function"]', function(evt) {
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

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CallGraphData, FunctionInfo } from './graph/types';

export function generateEvaluationReport(
  workspacePath: string,
  graphData: CallGraphData,
  masterFnMap: Record<string, Record<number, FunctionInfo>>,
  overallStart: number
) {
  const perFileStats: Record<string, any> = {};
  
  const files = graphData.files || [];
  const functions = graphData.functions || {};
  const calls = graphData.calls || {};
  const fun2fun = graphData.fun2fun || [];
  
  const incomingCount: Record<string, number> = {};
  fun2fun.forEach(([src, tgt]) => {
    incomingCount[tgt] = (incomingCount[tgt] || 0) + 1;
  });
  
  for (const file of files) {
    const fileStart = Date.now();
    const astFuncs = masterFnMap[file] ? Object.keys(masterFnMap[file]).length : 0;
    
    const graphFuncs = Object.entries(functions).filter(([fid, label]) => {
      const parts = String(label).split(':');
      return files[parseInt(parts[0], 10)] === file;
    }).length;
    
    const callSites = Object.entries(calls).filter(([cid, label]) => {
      const parts = String(label).split(':');
      return files[parseInt(parts[0], 10)] === file;
    }).length;
    
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
  
  let report = '';
  report += 'CallViz Evaluation Report\\n';
  report += '=========================\\n\\n';
  report += 'OVERALL\\n-------\\n';
  report += \`Total time:       \${overallTime} ms\\n\\n\`;
  report += 'PER-FILE\\n--------\\n';
  
  for (const file of files) {
    const stats = perFileStats[file];
    report += \`\${file}:\\n\`;
    report += \`  Time:            \${stats.time} ms\\n\`;
    report += \`  AST funcs:       \${stats.astFuncs}\\n\`;
    report += \`  Graph funcs:     \${stats.graphFuncs}\\n\`;
    report += \`  Call-site nodes: \${stats.callSites}\\n\`;
    report += \`  Dead funcs:      \${stats.deadFuncs}\\n\\n\`;
  }
  
  const evalPath = path.join(workspacePath, 'callviz-eval.txt');
  fs.writeFileSync(evalPath, report, 'utf-8');
  vscode.window.showInformationMessage('CallViz evaluation report written to callviz-eval.txt');
}

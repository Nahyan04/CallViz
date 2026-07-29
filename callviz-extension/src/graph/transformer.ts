import { CallGraphData, CytoscapeElement, FunctionInfo } from './types';

// Helper to truncate labels
function truncateLabel(label: string): string {
  return label.length > 20 ? label.slice(0, 17) + '…' : label;
}

// Helper to check if a file should be excluded
function shouldExcludeFile(fileName: string): boolean {
  return fileName.includes('/test/') || 
         fileName.includes('/tests/') || 
         fileName.includes('/__tests__/') ||
         fileName.startsWith('test/') ||
         fileName.endsWith('.test.js') ||
         fileName.endsWith('.spec.js');
}

export function transformToCytoscapeElements(
  jellyData: CallGraphData, 
  masterFnMap: Record<string, Record<number, FunctionInfo>>
): CytoscapeElement[] {
  const elements: CytoscapeElement[] = [];
  const filesArray = jellyData.files || [];
  
  const reachableFunctions = new Set<number>();
  
  if (jellyData.call2fun) {
    jellyData.call2fun.forEach(([callId, funcIdStr]) => {
      reachableFunctions.add(parseInt(funcIdStr, 10));
    });
  }

  function markReachable(funcId: number) {
    if (jellyData.fun2fun) {
      jellyData.fun2fun.forEach(([srcStr, tgtStr]) => {
        if (parseInt(srcStr, 10) === funcId) {
          const tgtId = parseInt(tgtStr, 10);
          if (!reachableFunctions.has(tgtId)) {
            reachableFunctions.add(tgtId);
            markReachable(tgtId);
          }
        }
      });
    }
  }
  
  Array.from(reachableFunctions).forEach(funcId => markReachable(funcId));

  function parseJellyLabel(label: string) {
    const parts = label.split(':').map(x => parseInt(x, 10));
    if (parts.length !== 5) return null;
    const [fileIndex, startLine, startCol, endLine, endCol] = parts;
    const fileName = filesArray[fileIndex] || 'unknown';
    return { fileName, startLine, startCol, endLine, endCol };
  }

  function findBestMatchingFunction(fileName: string, startLine: number): FunctionInfo | null {
    let fileMap = masterFnMap[fileName];
    if (!fileMap) {
      const baseName = fileName.split('/').pop() || '';
      for (const key in masterFnMap) {
        if (key.endsWith('/' + baseName) || key === baseName) {
          fileMap = masterFnMap[key];
          break;
        }
      }
    }
    if (!fileMap) return null;
    if (fileMap[startLine]) return fileMap[startLine];
    
    let bestMatch: FunctionInfo | null = null;
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
    return bestMatch;
  }

  const functionNodeIds = new Set<string>();

  if (jellyData.functions) {
    for (const funcIdStr in jellyData.functions) {
      const funcId = parseInt(funcIdStr, 10);
      const rawLabel = jellyData.functions[funcIdStr];
      const parsedLabel = parseJellyLabel(rawLabel);
      
      if (parsedLabel && shouldExcludeFile(parsedLabel.fileName)) continue;
      
      let fnInfo: FunctionInfo | null = null;
      let displayName = 'Unknown Function';
      let locationInfo = rawLabel;
      
      if (parsedLabel) {
        fnInfo = findBestMatchingFunction(parsedLabel.fileName, parsedLabel.startLine);
      }
      
      if (fnInfo) {
        displayName = fnInfo.name + fnInfo.paramsString;
        locationInfo = fnInfo.file + ': ' + fnInfo.startLine + '–' + fnInfo.endLine;
      } else if (parsedLabel) {
        displayName = 'Function in ' + parsedLabel.fileName + '@' + parsedLabel.startLine;
        locationInfo = parsedLabel.fileName + ': ' + parsedLabel.startLine + '–' + parsedLabel.endLine;
      }
      
      const reachable = reachableFunctions.has(funcId) ? 'Reachable' : 'Not Reachable';
      const nodeId = 'f' + funcIdStr;
      
      elements.push({
        data: {
          id: nodeId,
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
      functionNodeIds.add(nodeId);
    }
  }

  if (jellyData.calls) {
    for (const callIdStr in jellyData.calls) {
      const rawLabel = jellyData.calls[callIdStr];
      const parsedLabel = parseJellyLabel(rawLabel);
      
      if (parsedLabel && shouldExcludeFile(parsedLabel.fileName)) continue;
      
      let displayName = 'Call Site';
      let locationInfo = rawLabel;
      
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

  if (jellyData.fun2fun) {
    jellyData.fun2fun.forEach(([src, tgt]) => {
      const srcId = 'f' + src;
      const tgtId = 'f' + tgt;
      if (functionNodeIds.has(srcId) && functionNodeIds.has(tgtId)) {
        elements.push({
          data: {
            id: srcId + '-' + tgtId,
            source: srcId,
            target: tgtId,
            asyncOrExternal: false
          }
        });
      }
    });
  }

  if (jellyData.call2fun) {
    jellyData.call2fun.forEach(([callId, funcId]) => {
      const callNodeId = 'c' + callId;
      const funcNodeId = 'f' + funcId;
      if (elements.some(el => el.data.id === callNodeId) && functionNodeIds.has(funcNodeId)) {
        elements.push({
          data: {
            id: callNodeId + '-' + funcNodeId,
            source: callNodeId,
            target: funcNodeId,
            asyncOrExternal: false
          }
        });
      }
    });
  }

  return elements;
}

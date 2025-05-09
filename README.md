# 🕸️ CallViz – Interactive JavaScript Call Graphs in VS Code

CallViz is a Visual Studio Code extension that visualizes JavaScript call graphs using **static program analysis**. It integrates [Jelly](https://github.com/cs-au-dk/jelly) to generate call graph data, then uses [Acorn](https://github.com/acornjs/acorn) and [Cytoscape.js](https://js.cytoscape.org/) to display a fully interactive graph of your program’s function relationships inside VS Code.

---

## ✨ Features

- 📊 **Call Graph Generation** via static analysis (Jelly)
- 🧠 **Function Name Recovery** using Acorn (accurate, readable labels)
- 🧭 **Reachability Detection** (detect dead/unreachable code)
- 🎨 **Custom Node Styling** for functions (🟦), call sites (🟢), and dead code (gray dashed)
- 💬 **Interactive Tooltips** with file/line info, parameters, and reachability
- 🖱️ **Edge Highlighting** on node hover
- 🔍 **Search and Filter** interface
- ☑️ **Toggle for Dead Code**
- 📥 **Jump-to-Code** support – click any function node to open its definition in the editor
- 📤 **Graph Export** as PNG and JSON

---

## 📦 Installation

### 1. Install Prerequisites

- Node.js v18+
- VS Code
- (Optional) Docker for isolated Jelly usage

Install CLI tools globally:

    npm install -g yo generator-code vsce @cs-au-dk/jelly

### 2. Clone & Run

    git clone https://github.com/nahyan04/callviz.git
    cd callviz
    npm install
    code .

In VS Code:

1. Press `F5` to launch a development window.
2. Open a JavaScript/TypeScript project in that window.
3. Run `CallViz: Analyze Project` from the Command Palette.

---

## 🐳 Docker Usage (Optional)

To run Jelly inside Docker instead of installing globally:

    docker build -t callviz-docker .
    docker run -it --rm -v $(pwd):/callviz callviz-docker

Then inside the container:

    jelly -j cg.json ./

---

## 🧠 How It Works

1. **Run Jelly**: The extension executes Jelly on the project, outputting `cg.json`.
2. **Parse Source Files**: It uses Acorn to parse all `.js` and `.ts` files in the workspace, recovering function names, parameters, and positions.
3. **Map to Graph Nodes**: Jelly's label ranges (`"0:4:3:6:4"`) are matched to Acorn function locations to annotate the graph.
4. **Visualize in Cytoscape**: The WebView renders function and call-site nodes with custom styles, tooltips, edge highlighting, and filtering.

---

## 🔧 Developer UX Features

- Click a node → jump to the source function in your editor
- Hover over nodes → see detailed metadata (function name, file, reachability)
- Search for any function by name
- Toggle unreachable functions
- Export the current graph as PNG or raw JSON
- Highlight full call paths between two nodes
- Filter graph by file or node type

---

## 🧪 Replicating Results with 'test-callviz'

- Open the folder named 'test-callviz', it contains sample json code for testing.
- Press Cntrl+Shift+P and run command: > CallViz: Generate Call Graph
- A visual Call Graph will be generated for the code inside test-callviz, and an evaluation report will be outputted in the same workspace.


## 📎 Acknowledgements

- [Jelly](https://github.com/cs-au-dk/jelly) – Static analyzer for JavaScript
- [Acorn](https://github.com/acornjs/acorn) – Lightweight JS parser
- [Cytoscape.js](https://js.cytoscape.org/) – Graph visualization library
- [VS Code Extension API](https://code.visualstudio.com/api)

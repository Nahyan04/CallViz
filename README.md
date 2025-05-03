# 🕸️ CallViz – Interactive JavaScript Call Graphs in VS Code

CallViz is a VS Code extension that uses **[Jelly](https://github.com/cs-au-dk/jelly)** for static analysis of JavaScript code, visualizing the resulting call graph as an **interactive, searchable, and annotated graph** using Cytoscape.js.

---

## ✨ Features

- 📊 Call graph generation via **approximate interpretation**
- 🧠 Interactive visualization with **function names, parameters, locations**
- 🧭 Reachability analysis (marking "dead" functions)
- 🟦 Blue square nodes for functions, 🟢 green circles for call sites
- 🛠️ Built with Acorn, Cytoscape.js, and VS Code's extension API

---

## 📦 Installation

### 1. Install Dependencies

- Node.js v18+
- VS Code
- Docker (optional, for isolated Jelly usage)

    npm install -g yo generator-code vsce @cs-au-dk/jelly

---
## 📁 Clone & Run


### 2. Clone & Run

    git clone https://github.com/nahyan04/callviz.git
    cd callviz
    npm install
    code .
    
---
## 🐳 Docker

  docker build -t callviz-docker .
  docker run -it --rm -v $(pwd):/callviz callviz-docker
  
## Inside the container:
```bash
jelly -j cg.json ./
```
---

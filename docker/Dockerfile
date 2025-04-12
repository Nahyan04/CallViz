# Dockerfile for CallViz – minimal, for Node & Jelly usage
# Using a Node official image that supports ARM (M1)
FROM node:18

# Ensure we have the latest package info for any native dependencies
# (Often needed if you have to install system packages)
RUN apt-get update && apt-get install -y \
    git \
    # Add other packages if needed, for example:
    # build-essential
    # python3
    # etc.
    && rm -rf /var/lib/apt/lists/*

# Install essential global Node tools
# - typescript: for compiling TS (if your extension or Jelly code needs it)
# - vsce: for packaging a VS Code extension
# - Jelly: the static analyzer
RUN npm install -g \
    typescript \
    vsce \
    @cs-au-dk/jelly

# Create a working directory in the container
WORKDIR /callviz

# Copy all contents from your local repo into the container
# (the dot . means “copy from current directory on host”)
# We’ll step up one directory because Dockerfile is in /docker
COPY ../ /callviz

# Install local project dependencies (if any), e.g. if you have a package.json in the repo root
# You can skip or adjust if your extension code is in a subfolder
RUN npm install || true

# By default, let’s just run a bash shell
CMD ["/bin/bash"]
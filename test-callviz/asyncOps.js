const delay = ms => new Promise(r => setTimeout(r, ms));

// Async recursion
async function fetchChain(depth = 1) {
  if (depth > 3) return depth;
  await delay(50);
  return fetchChain(depth + 1);
}

// Promise-based call
function getData() {
  return Promise.resolve([1, 2, 3]);
}

// Dead async
async function deadAsync() {
  await delay(10);
  return 'should never see this';
}

module.exports = { fetchChain, getData, deadAsync };

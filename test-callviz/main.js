// main.js

const math = require('./mathUtils');
const str = require('./stringUtils');
const asyncOps = require('./asyncOps');
const { Greeter } = require('./classModule');

function demoMath() {
  console.log('5! =', math.factorial(5));
  console.log('Fib(6) =', math.fibonacci(6));
  console.log('10 is even?', math.isEven(10));
}

function demoStrings() {
  const s = 'CallViz';
  console.log('Reversed:', str.reverse(s));
  console.log('MaybeUpper:', str.maybeUpper(s));
}

async function demoAsync() {
  const chainResult = await asyncOps.fetchChain();
  console.log('Async chain ended at', chainResult);
  const data = await asyncOps.getData();
  console.log('Got data:', data);
}

function demoClass() {
  const g = new Greeter('Alice');
  g.greet();
  // g.hidden();  // never invoked
}

async function main() {
  demoMath();
  demoStrings();
  await demoAsync();
  demoClass();
}

main();

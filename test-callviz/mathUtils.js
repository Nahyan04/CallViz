// Simple recursion
function factorial(n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
  }
  
  // Exponential recursion
  function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
  }
  
  // Mutual recursion
  function isEven(n) {
    return n === 0 ? true : isOdd(n - 1);
  }
  function isOdd(n) {
    return n === 0 ? false : isEven(n - 1);
  }
  
  // Dead (never called)
  function unusedMath() {
    console.log('unused math');
  }
  
  module.exports = { factorial, fibonacci, isEven, isOdd, unusedMath };
  
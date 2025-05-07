
class Greeter {
    constructor(name) {
      this.name = name;
    }
    greet() {
      console.log(`Hello, ${this.name}!`);
      this.logTime();
    }
    logTime() {
      console.log('Time is', new Date().toLocaleTimeString());
    }
    // never called
    hidden() {
      console.log('You should not see me');
    }
  }
  
  module.exports = { Greeter };
  
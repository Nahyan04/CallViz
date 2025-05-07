// Loop-based reversal
function reverse(str) {
  let out = '';
  for (let i = str.length - 1; i >= 0; i--) {
    out += str[i];
  }
  return out;
}

// Conditional helper
const config = { uppercase: false };
function maybeUpper(s) {
  if (config.uppercase) return s.toUpperCase();
  return s;
}

// Dead helper
function deadString() {
  return 'never used';
}

module.exports = { reverse, maybeUpper, deadString };

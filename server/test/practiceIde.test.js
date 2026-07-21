const assert = require('assert');

// Unit Test 1: SM-2 Spaced Repetition Next Review Date Calculation
function calculateNextReview(quality, currentInterval = 1, currentEase = 2.5, currentCount = 0) {
  const q = Math.max(0, Math.min(5, Number(quality) || 3));
  const reviewCount = currentCount + 1;
  const easeFactor = Math.max(1.3, currentEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  let interval = 1;
  if (q >= 3) {
    if (reviewCount === 1) interval = 1;
    else if (reviewCount === 2) interval = 6;
    else interval = Math.round(currentInterval * easeFactor);
  }

  return { interval, easeFactor: parseFloat(easeFactor.toFixed(2)), reviewCount };
}

// Validation
const res1 = calculateNextReview(5, 1, 2.5, 0);
assert.strictEqual(res1.interval, 1, 'First review interval should be 1 day');
assert.strictEqual(res1.reviewCount, 1, 'Review count should increment to 1');

const res2 = calculateNextReview(5, 1, 2.5, 1);
assert.strictEqual(res2.interval, 6, 'Second review interval should be 6 days');

console.log('✓ Practice IDE & SM-2 Spaced Repetition Unit Tests PASSED (2/2)');

const assert = require('assert');

// Unit Test 1: Leaderboard Sorting (Score DESC, Penalty ASC)
function sortLeaderboard(participants) {
  return [...participants].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.penalty - b.penalty;
  });
}

const mockParticipants = [
  { id: 'p1', name: 'Alice', score: 200, penalty: 45 },
  { id: 'p2', name: 'Bob', score: 300, penalty: 60 },
  { id: 'p3', name: 'Charlie', score: 200, penalty: 20 }
];

const ranked = sortLeaderboard(mockParticipants);
assert.strictEqual(ranked[0].name, 'Bob', 'Bob with 300 pts should be rank 1');
assert.strictEqual(ranked[1].name, 'Charlie', 'Charlie with 200 pts and 20s penalty should be rank 2');
assert.strictEqual(ranked[2].name, 'Alice', 'Alice with 200 pts and 45s penalty should be rank 3');

console.log('✓ Contest Engine Leaderboard Unit Tests PASSED (1/1)');

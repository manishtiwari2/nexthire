const assert = require('assert');

function determineRole(email) {
  const normalized = email.toLowerCase().trim();
  if (normalized === 'anuradha@admin.at' || normalized === 'manish@admin.mt') {
    return 'ADMIN';
  }
  return 'CANDIDATE';
}

// Unit Test 1: Admin Role Auto-Assignment
assert.strictEqual(determineRole('anuradha@admin.at'), 'ADMIN', 'anuradha@admin.at must be assigned ADMIN role');
assert.strictEqual(determineRole('manish@admin.mt'), 'ADMIN', 'manish@admin.mt must be assigned ADMIN role');
assert.strictEqual(determineRole('ANURADHA@ADMIN.AT'), 'ADMIN', 'Role check must be case insensitive');

// Unit Test 2: Candidate Role Assignment
assert.strictEqual(determineRole('alex@nexthire.dev'), 'CANDIDATE', 'Other emails must be assigned CANDIDATE role');
assert.strictEqual(determineRole('user@example.com'), 'CANDIDATE', 'Other emails must be assigned CANDIDATE role');

console.log('✓ Auth Role Determination Unit Tests PASSED (2/2)');

// System study-sheet definitions. Each references questions by leetcode slug (the same slugs
// seeded from problems.js) — questions are shared across sheets, never duplicated.
//
// `membership`:
//   'all'      → every seeded problem, grouped by its section
//   'blind75'  → the Blind-75-flagged problems, grouped by section
//   [slugs...] → an explicit, ordered curated list (section defaults to the problem's topic)
//
// Curated lists (Grind, Striver, Top Interview) are adapted selections built from the seeded
// catalogue for study convenience; only slugs that exist in the catalogue are used.

const GRIND_75 = [
  'two-sum', 'valid-parentheses', 'merge-two-sorted-lists', 'best-time-to-buy-and-sell-stock',
  'valid-palindrome', 'invert-binary-tree', 'valid-anagram', 'binary-search',
  'linked-list-cycle', 'maximum-depth-of-binary-tree', 'contains-duplicate',
  'maximum-subarray', 'insert-interval', 'climbing-stairs', 'longest-palindromic-substring',
  'reverse-linked-list', 'same-tree', 'lowest-common-ancestor-of-a-binary-search-tree',
  'group-anagrams', 'implement-trie-prefix-tree', 'container-with-most-water',
  'longest-substring-without-repeating-characters', '3sum', 'coin-change', 'product-of-array-except-self',
  'number-of-islands', 'clone-graph', 'course-schedule', 'combination-sum', 'permutations',
  'merge-intervals', 'binary-tree-level-order-traversal', 'validate-binary-search-tree',
  'kth-smallest-element-in-a-bst', 'word-break', 'house-robber', 'unique-paths',
  'longest-common-subsequence', 'find-median-from-data-stream', 'word-search',
  'top-k-frequent-elements', 'longest-increasing-subsequence', 'rotate-image', 'spiral-matrix',
  'subsets', 'jump-game', 'trapping-rain-water', 'serialize-and-deserialize-binary-tree',
  'minimum-window-substring', 'word-ladder', 'largest-rectangle-in-histogram', 'merge-k-sorted-lists',
  'alien-dictionary', 'binary-tree-maximum-path-sum', 'edit-distance', 'median-of-two-sorted-arrays'
].filter(Boolean);

const STRIVER_SDE = [
  // Arrays
  'set-matrix-zeroes', 'product-of-array-except-self', 'maximum-subarray', 'merge-intervals',
  'find-the-duplicate-number', 'rotate-image', 'spiral-matrix',
  // Linked List
  'reverse-linked-list', 'merge-two-sorted-lists', 'remove-nth-node-from-end-of-list',
  'add-two-numbers', 'linked-list-cycle', 'reorder-list', 'copy-list-with-random-pointer',
  // Greedy
  'jump-game', 'jump-game-ii', 'gas-station',
  // Binary Search
  'search-in-rotated-sorted-array', 'find-minimum-in-rotated-sorted-array', 'median-of-two-sorted-arrays',
  'koko-eating-bananas',
  // Strings / Sliding Window
  'longest-substring-without-repeating-characters', 'longest-palindromic-substring',
  // Trees
  'maximum-depth-of-binary-tree', 'diameter-of-binary-tree', 'binary-tree-level-order-traversal',
  'binary-tree-maximum-path-sum', 'validate-binary-search-tree',
  'lowest-common-ancestor-of-a-binary-search-tree', 'serialize-and-deserialize-binary-tree',
  // Graphs
  'number-of-islands', 'clone-graph', 'course-schedule', 'course-schedule-ii', 'word-ladder',
  // DP
  'climbing-stairs', 'house-robber', 'coin-change', 'longest-increasing-subsequence',
  'longest-common-subsequence', 'edit-distance', 'unique-paths'
];

const TOP_INTERVIEW_150 = [
  'two-sum', 'best-time-to-buy-and-sell-stock', 'product-of-array-except-self', 'jump-game',
  'jump-game-ii', 'happy-number', 'plus-one', 'valid-palindrome', 'valid-anagram',
  'group-anagrams', 'contains-duplicate', 'longest-consecutive-sequence', 'merge-intervals',
  'insert-interval', 'valid-parentheses', 'min-stack', 'evaluate-reverse-polish-notation',
  'reverse-linked-list', 'merge-two-sorted-lists', 'linked-list-cycle', 'add-two-numbers',
  'lru-cache', 'copy-list-with-random-pointer', 'remove-nth-node-from-end-of-list',
  'maximum-depth-of-binary-tree', 'same-tree', 'invert-binary-tree',
  'construct-binary-tree-from-preorder-and-inorder-traversal', 'binary-tree-level-order-traversal',
  'binary-tree-right-side-view', 'validate-binary-search-tree', 'kth-smallest-element-in-a-bst',
  'number-of-islands', 'surrounded-regions', 'course-schedule', 'course-schedule-ii',
  'word-ladder', 'implement-trie-prefix-tree', 'design-add-and-search-words-data-structure',
  'word-search-ii', 'letter-combinations-of-a-phone-number', 'combination-sum', 'permutations',
  'subsets', 'word-search', 'n-queens', 'kth-largest-element-in-an-array',
  'k-closest-points-to-origin', 'find-median-from-data-stream', 'task-scheduler', 'search-a-2d-matrix',
  'search-in-rotated-sorted-array', 'find-minimum-in-rotated-sorted-array', 'median-of-two-sorted-arrays',
  'climbing-stairs', 'house-robber', 'word-break', 'coin-change', 'longest-increasing-subsequence',
  'longest-common-subsequence', 'maximum-subarray', 'unique-paths', 'edit-distance',
  'single-number', 'number-of-1-bits', 'reverse-bits', 'rotate-image', 'spiral-matrix',
  'set-matrix-zeroes', 'powx-n'
];

const SHEETS = [
  {
    name: 'Blind 75',
    slug: 'blind-75',
    description: 'The classic 75-problem list that covers the core interview patterns with minimal overlap.',
    membership: 'blind75'
  },
  {
    name: 'NeetCode 150',
    slug: 'neetcode-150',
    description: 'A broader, pattern-organised set of 150 problems spanning every major DSA topic.',
    membership: 'all'
  },
  {
    name: 'Grind 75',
    slug: 'grind-75',
    description: 'A beginner-friendly ordering that ramps difficulty gradually — a great first pass.',
    membership: GRIND_75
  },
  {
    name: 'Striver SDE Sheet',
    slug: 'striver-sde-sheet',
    description: 'A topic-by-topic SDE preparation sequence popular for structured revision.',
    membership: STRIVER_SDE
  },
  {
    name: 'Top Interview 150',
    slug: 'top-interview-150',
    description: 'High-frequency interview problems grouped for a focused final-stretch review.',
    membership: TOP_INTERVIEW_150
  }
];

module.exports = { SHEETS };

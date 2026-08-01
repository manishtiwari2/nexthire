// Curated Question Library reference dataset.
//
// COMPLIANCE: this file stores ONLY metadata about well-known interview problems — the
// factual problem *name*, the public source URL, and our own topic/difficulty/company
// classification. It contains NO problem statements, examples, constraints, or test cases
// copied from any platform. Seeded rows are marked `isExternalOnly: true`, so the app links
// out to the original source instead of presenting a local statement or running a judge.
//
// Company tags are illustrative sample classifications for building "Company Collection"
// views; they are not an authoritative record of any company's interviews.

// Difficulty shorthand → schema enum.
const D = { E: 'EASY', M: 'MEDIUM', H: 'HARD' };
// Estimated solve time (minutes) by difficulty — a reasonable default the user can override.
const EST = { EASY: 15, MEDIUM: 30, HARD: 45 };

// NeetCode-150-style catalogue, grouped by section. Each row: [title, leetcodeSlug, difficulty].
// `topic` is the primary Topic (must match a seeded Topic name); `sub` are subtopics.
const SECTIONS = [
  { section: 'Arrays & Hashing', topic: 'Arrays', sub: ['Hashing'], rows: [
    ['Contains Duplicate', 'contains-duplicate', 'E'],
    ['Valid Anagram', 'valid-anagram', 'E'],
    ['Two Sum', 'two-sum', 'E'],
    ['Group Anagrams', 'group-anagrams', 'M'],
    ['Top K Frequent Elements', 'top-k-frequent-elements', 'M'],
    ['Encode and Decode Strings', 'encode-and-decode-strings', 'M'],
    ['Product of Array Except Self', 'product-of-array-except-self', 'M'],
    ['Valid Sudoku', 'valid-sudoku', 'M'],
    ['Longest Consecutive Sequence', 'longest-consecutive-sequence', 'M']
  ] },
  { section: 'Two Pointers', topic: 'Two Pointers', sub: [], rows: [
    ['Valid Palindrome', 'valid-palindrome', 'E'],
    ['Two Sum II - Input Array Is Sorted', 'two-sum-ii-input-array-is-sorted', 'M'],
    ['3Sum', '3sum', 'M'],
    ['Container With Most Water', 'container-with-most-water', 'M'],
    ['Trapping Rain Water', 'trapping-rain-water', 'H']
  ] },
  { section: 'Sliding Window', topic: 'Sliding Window', sub: [], rows: [
    ['Best Time to Buy and Sell Stock', 'best-time-to-buy-and-sell-stock', 'E'],
    ['Longest Substring Without Repeating Characters', 'longest-substring-without-repeating-characters', 'M'],
    ['Longest Repeating Character Replacement', 'longest-repeating-character-replacement', 'M'],
    ['Permutation in String', 'permutation-in-string', 'M'],
    ['Minimum Window Substring', 'minimum-window-substring', 'H'],
    ['Sliding Window Maximum', 'sliding-window-maximum', 'H']
  ] },
  { section: 'Stack', topic: 'Stack', sub: [], rows: [
    ['Valid Parentheses', 'valid-parentheses', 'E'],
    ['Min Stack', 'min-stack', 'M'],
    ['Evaluate Reverse Polish Notation', 'evaluate-reverse-polish-notation', 'M'],
    ['Generate Parentheses', 'generate-parentheses', 'M'],
    ['Daily Temperatures', 'daily-temperatures', 'M'],
    ['Car Fleet', 'car-fleet', 'M'],
    ['Largest Rectangle in Histogram', 'largest-rectangle-in-histogram', 'H']
  ] },
  { section: 'Binary Search', topic: 'Binary Search', sub: [], rows: [
    ['Binary Search', 'binary-search', 'E'],
    ['Search a 2D Matrix', 'search-a-2d-matrix', 'M'],
    ['Koko Eating Bananas', 'koko-eating-bananas', 'M'],
    ['Find Minimum in Rotated Sorted Array', 'find-minimum-in-rotated-sorted-array', 'M'],
    ['Search in Rotated Sorted Array', 'search-in-rotated-sorted-array', 'M'],
    ['Time Based Key-Value Store', 'time-based-key-value-store', 'M'],
    ['Median of Two Sorted Arrays', 'median-of-two-sorted-arrays', 'H']
  ] },
  { section: 'Linked List', topic: 'Linked List', sub: [], rows: [
    ['Reverse Linked List', 'reverse-linked-list', 'E'],
    ['Merge Two Sorted Lists', 'merge-two-sorted-lists', 'E'],
    ['Linked List Cycle', 'linked-list-cycle', 'E'],
    ['Reorder List', 'reorder-list', 'M'],
    ['Remove Nth Node From End of List', 'remove-nth-node-from-end-of-list', 'M'],
    ['Copy List with Random Pointer', 'copy-list-with-random-pointer', 'M'],
    ['Add Two Numbers', 'add-two-numbers', 'M'],
    ['Find the Duplicate Number', 'find-the-duplicate-number', 'M'],
    ['LRU Cache', 'lru-cache', 'M'],
    ['Merge k Sorted Lists', 'merge-k-sorted-lists', 'H'],
    ['Reverse Nodes in k-Group', 'reverse-nodes-in-k-group', 'H']
  ] },
  { section: 'Trees', topic: 'Trees', sub: ['DFS', 'BFS'], rows: [
    ['Invert Binary Tree', 'invert-binary-tree', 'E'],
    ['Maximum Depth of Binary Tree', 'maximum-depth-of-binary-tree', 'E'],
    ['Diameter of Binary Tree', 'diameter-of-binary-tree', 'E'],
    ['Balanced Binary Tree', 'balanced-binary-tree', 'E'],
    ['Same Tree', 'same-tree', 'E'],
    ['Subtree of Another Tree', 'subtree-of-another-tree', 'E'],
    ['Binary Tree Level Order Traversal', 'binary-tree-level-order-traversal', 'M'],
    ['Binary Tree Right Side View', 'binary-tree-right-side-view', 'M'],
    ['Count Good Nodes in Binary Tree', 'count-good-nodes-in-binary-tree', 'M'],
    ['Construct Binary Tree from Preorder and Inorder Traversal', 'construct-binary-tree-from-preorder-and-inorder-traversal', 'M'],
    ['Binary Tree Maximum Path Sum', 'binary-tree-maximum-path-sum', 'H'],
    ['Serialize and Deserialize Binary Tree', 'serialize-and-deserialize-binary-tree', 'H']
  ] },
  { section: 'Binary Search Trees', topic: 'BST', sub: ['Trees'], rows: [
    ['Lowest Common Ancestor of a Binary Search Tree', 'lowest-common-ancestor-of-a-binary-search-tree', 'M'],
    ['Validate Binary Search Tree', 'validate-binary-search-tree', 'M'],
    ['Kth Smallest Element in a BST', 'kth-smallest-element-in-a-bst', 'M']
  ] },
  { section: 'Tries', topic: 'Tries', sub: [], rows: [
    ['Implement Trie (Prefix Tree)', 'implement-trie-prefix-tree', 'M'],
    ['Design Add and Search Words Data Structure', 'design-add-and-search-words-data-structure', 'M'],
    ['Word Search II', 'word-search-ii', 'H']
  ] },
  { section: 'Heap / Priority Queue', topic: 'Heap', sub: [], rows: [
    ['Kth Largest Element in a Stream', 'kth-largest-element-in-a-stream', 'E'],
    ['Last Stone Weight', 'last-stone-weight', 'E'],
    ['K Closest Points to Origin', 'k-closest-points-to-origin', 'M'],
    ['Kth Largest Element in an Array', 'kth-largest-element-in-an-array', 'M'],
    ['Task Scheduler', 'task-scheduler', 'M'],
    ['Design Twitter', 'design-twitter', 'M'],
    ['Find Median from Data Stream', 'find-median-from-data-stream', 'H']
  ] },
  { section: 'Backtracking', topic: 'Backtracking', sub: [], rows: [
    ['Subsets', 'subsets', 'M'],
    ['Combination Sum', 'combination-sum', 'M'],
    ['Permutations', 'permutations', 'M'],
    ['Subsets II', 'subsets-ii', 'M'],
    ['Combination Sum II', 'combination-sum-ii', 'M'],
    ['Word Search', 'word-search', 'M'],
    ['Palindrome Partitioning', 'palindrome-partitioning', 'M'],
    ['Letter Combinations of a Phone Number', 'letter-combinations-of-a-phone-number', 'M'],
    ['N-Queens', 'n-queens', 'H']
  ] },
  { section: 'Graphs', topic: 'Graphs', sub: ['DFS', 'BFS', 'Union Find'], rows: [
    ['Number of Islands', 'number-of-islands', 'M'],
    ['Clone Graph', 'clone-graph', 'M'],
    ['Max Area of Island', 'max-area-of-island', 'M'],
    ['Pacific Atlantic Water Flow', 'pacific-atlantic-water-flow', 'M'],
    ['Surrounded Regions', 'surrounded-regions', 'M'],
    ['Rotting Oranges', 'rotting-oranges', 'M'],
    ['Course Schedule', 'course-schedule', 'M'],
    ['Course Schedule II', 'course-schedule-ii', 'M'],
    ['Redundant Connection', 'redundant-connection', 'M'],
    ['Number of Connected Components in an Undirected Graph', 'number-of-connected-components-in-an-undirected-graph', 'M'],
    ['Graph Valid Tree', 'graph-valid-tree', 'M'],
    ['Word Ladder', 'word-ladder', 'H']
  ] },
  { section: 'Advanced Graphs', topic: 'Graphs', sub: ['Shortest Path'], rows: [
    ['Reconstruct Itinerary', 'reconstruct-itinerary', 'H'],
    ['Min Cost to Connect All Points', 'min-cost-to-connect-all-points', 'M'],
    ['Network Delay Time', 'network-delay-time', 'M'],
    ['Swim in Rising Water', 'swim-in-rising-water', 'H'],
    ['Alien Dictionary', 'alien-dictionary', 'H'],
    ['Cheapest Flights Within K Stops', 'cheapest-flights-within-k-stops', 'M']
  ] },
  { section: '1-D Dynamic Programming', topic: 'Dynamic Programming', sub: [], rows: [
    ['Climbing Stairs', 'climbing-stairs', 'E'],
    ['Min Cost Climbing Stairs', 'min-cost-climbing-stairs', 'E'],
    ['House Robber', 'house-robber', 'M'],
    ['House Robber II', 'house-robber-ii', 'M'],
    ['Longest Palindromic Substring', 'longest-palindromic-substring', 'M'],
    ['Palindromic Substrings', 'palindromic-substrings', 'M'],
    ['Decode Ways', 'decode-ways', 'M'],
    ['Coin Change', 'coin-change', 'M'],
    ['Maximum Product Subarray', 'maximum-product-subarray', 'M'],
    ['Word Break', 'word-break', 'M'],
    ['Longest Increasing Subsequence', 'longest-increasing-subsequence', 'M'],
    ['Partition Equal Subset Sum', 'partition-equal-subset-sum', 'M']
  ] },
  { section: '2-D Dynamic Programming', topic: 'Dynamic Programming', sub: [], rows: [
    ['Unique Paths', 'unique-paths', 'M'],
    ['Longest Common Subsequence', 'longest-common-subsequence', 'M'],
    ['Best Time to Buy and Sell Stock with Cooldown', 'best-time-to-buy-and-sell-stock-with-cooldown', 'M'],
    ['Coin Change II', 'coin-change-ii', 'M'],
    ['Target Sum', 'target-sum', 'M'],
    ['Interleaving String', 'interleaving-string', 'M'],
    ['Edit Distance', 'edit-distance', 'H'],
    ['Distinct Subsequences', 'distinct-subsequences', 'H'],
    ['Burst Balloons', 'burst-balloons', 'H'],
    ['Regular Expression Matching', 'regular-expression-matching', 'H']
  ] },
  { section: 'Greedy', topic: 'Greedy', sub: [], rows: [
    ['Maximum Subarray', 'maximum-subarray', 'M'],
    ['Jump Game', 'jump-game', 'M'],
    ['Jump Game II', 'jump-game-ii', 'M'],
    ['Gas Station', 'gas-station', 'M'],
    ['Hand of Straights', 'hand-of-straights', 'M'],
    ['Merge Triplets to Form Target Triplet', 'merge-triplets-to-form-target-triplet', 'M'],
    ['Partition Labels', 'partition-labels', 'M'],
    ['Valid Parenthesis String', 'valid-parenthesis-string', 'M']
  ] },
  { section: 'Intervals', topic: 'Arrays', sub: ['Intervals', 'Sorting'], rows: [
    ['Insert Interval', 'insert-interval', 'M'],
    ['Merge Intervals', 'merge-intervals', 'M'],
    ['Non-overlapping Intervals', 'non-overlapping-intervals', 'M'],
    ['Meeting Rooms', 'meeting-rooms', 'E'],
    ['Meeting Rooms II', 'meeting-rooms-ii', 'M'],
    ['Minimum Interval to Include Each Query', 'minimum-interval-to-include-each-query', 'H']
  ] },
  { section: 'Math & Geometry', topic: 'Math', sub: [], rows: [
    ['Rotate Image', 'rotate-image', 'M'],
    ['Spiral Matrix', 'spiral-matrix', 'M'],
    ['Set Matrix Zeroes', 'set-matrix-zeroes', 'M'],
    ['Happy Number', 'happy-number', 'E'],
    ['Plus One', 'plus-one', 'E'],
    ['Pow(x, n)', 'powx-n', 'M'],
    ['Multiply Strings', 'multiply-strings', 'M'],
    ['Detect Squares', 'detect-squares', 'M']
  ] },
  { section: 'Bit Manipulation', topic: 'Bit Manipulation', sub: [], rows: [
    ['Single Number', 'single-number', 'E'],
    ['Number of 1 Bits', 'number-of-1-bits', 'E'],
    ['Counting Bits', 'counting-bits', 'E'],
    ['Reverse Bits', 'reverse-bits', 'E'],
    ['Missing Number', 'missing-number', 'E'],
    ['Sum of Two Integers', 'sum-of-two-integers', 'M'],
    ['Reverse Integer', 'reverse-integer', 'M']
  ] }
];

// Blind 75 membership (by leetcode slug). Members are flagged HIGH frequency.
const BLIND75 = new Set([
  'two-sum', 'best-time-to-buy-and-sell-stock', 'contains-duplicate', 'product-of-array-except-self',
  'maximum-subarray', 'maximum-product-subarray', 'find-minimum-in-rotated-sorted-array',
  'search-in-rotated-sorted-array', '3sum', 'container-with-most-water', 'sum-of-two-integers',
  'number-of-1-bits', 'counting-bits', 'missing-number', 'reverse-bits', 'climbing-stairs',
  'coin-change', 'longest-increasing-subsequence', 'longest-common-subsequence', 'word-break',
  'combination-sum', 'house-robber', 'house-robber-ii', 'decode-ways', 'unique-paths',
  'jump-game', 'clone-graph', 'course-schedule', 'pacific-atlantic-water-flow', 'number-of-islands',
  'longest-consecutive-sequence', 'alien-dictionary', 'graph-valid-tree',
  'number-of-connected-components-in-an-undirected-graph', 'insert-interval', 'merge-intervals',
  'non-overlapping-intervals', 'meeting-rooms', 'meeting-rooms-ii', 'reverse-linked-list',
  'linked-list-cycle', 'merge-two-sorted-lists', 'merge-k-sorted-lists',
  'remove-nth-node-from-end-of-list', 'reorder-list', 'set-matrix-zeroes', 'spiral-matrix',
  'rotate-image', 'valid-anagram', 'group-anagrams', 'valid-parentheses', 'valid-palindrome',
  'longest-palindromic-substring', 'palindromic-substrings', 'encode-and-decode-strings',
  'longest-substring-without-repeating-characters', 'longest-repeating-character-replacement',
  'minimum-window-substring', 'invert-binary-tree', 'maximum-depth-of-binary-tree', 'same-tree',
  'subtree-of-another-tree', 'lowest-common-ancestor-of-a-binary-search-tree',
  'binary-tree-level-order-traversal', 'validate-binary-search-tree', 'kth-smallest-element-in-a-bst',
  'construct-binary-tree-from-preorder-and-inorder-traversal', 'binary-tree-maximum-path-sum',
  'serialize-and-deserialize-binary-tree', 'subsets', 'word-search',
  'implement-trie-prefix-tree', 'design-add-and-search-words-data-structure', 'word-search-ii',
  'find-median-from-data-stream', 'top-k-frequent-elements'
]);

// Curated illustrative company tags for well-known problems.
const COMPANY_TAGS = {
  'two-sum': ['Amazon', 'Google', 'Microsoft'],
  'group-anagrams': ['Amazon', 'Uber'],
  'top-k-frequent-elements': ['Amazon', 'Adobe', 'Flipkart'],
  'product-of-array-except-self': ['Amazon', 'Meta', 'Microsoft'],
  'longest-consecutive-sequence': ['Google', 'Amazon'],
  '3sum': ['Amazon', 'Meta', 'Adobe'],
  'container-with-most-water': ['Amazon', 'Meta'],
  'trapping-rain-water': ['Amazon', 'Google', 'Flipkart'],
  'best-time-to-buy-and-sell-stock': ['Amazon', 'Microsoft', 'Flipkart'],
  'longest-substring-without-repeating-characters': ['Amazon', 'Adobe', 'Uber'],
  'minimum-window-substring': ['Amazon', 'Meta', 'Uber'],
  'valid-parentheses': ['Amazon', 'Google', 'Microsoft'],
  'min-stack': ['Amazon', 'Microsoft'],
  'largest-rectangle-in-histogram': ['Amazon', 'Google'],
  'search-in-rotated-sorted-array': ['Amazon', 'Microsoft', 'Uber'],
  'median-of-two-sorted-arrays': ['Google', 'Adobe', 'Amazon'],
  'reverse-linked-list': ['Amazon', 'Microsoft', 'Adobe'],
  'merge-two-sorted-lists': ['Amazon', 'Microsoft'],
  'lru-cache': ['Amazon', 'Microsoft', 'Meta', 'Atlassian'],
  'merge-k-sorted-lists': ['Amazon', 'Google', 'Uber'],
  'invert-binary-tree': ['Google', 'Amazon'],
  'binary-tree-level-order-traversal': ['Amazon', 'Microsoft', 'Flipkart'],
  'validate-binary-search-tree': ['Amazon', 'Microsoft', 'Adobe'],
  'serialize-and-deserialize-binary-tree': ['Amazon', 'Meta', 'Google'],
  'binary-tree-maximum-path-sum': ['Amazon', 'Microsoft'],
  'implement-trie-prefix-tree': ['Amazon', 'Google', 'Microsoft'],
  'word-search-ii': ['Amazon', 'Microsoft', 'Uber'],
  'find-median-from-data-stream': ['Amazon', 'Google', 'Atlassian'],
  'number-of-islands': ['Amazon', 'Google', 'Microsoft', 'Uber'],
  'clone-graph': ['Amazon', 'Meta', 'Google'],
  'course-schedule': ['Amazon', 'Google', 'Atlassian'],
  'word-ladder': ['Amazon', 'Google'],
  'alien-dictionary': ['Amazon', 'Meta', 'Google'],
  'coin-change': ['Amazon', 'Adobe', 'Flipkart'],
  'word-break': ['Amazon', 'Google', 'Uber'],
  'longest-increasing-subsequence': ['Microsoft', 'Amazon'],
  'edit-distance': ['Google', 'Amazon', 'Adobe'],
  'maximum-subarray': ['Amazon', 'Microsoft', 'Flipkart'],
  'jump-game': ['Amazon', 'Uber'],
  'merge-intervals': ['Amazon', 'Google', 'Microsoft', 'Atlassian'],
  'meeting-rooms-ii': ['Amazon', 'Google', 'Uber', 'Atlassian'],
  'insert-interval': ['Amazon', 'Google'],
  'rotate-image': ['Amazon', 'Microsoft', 'Adobe'],
  'spiral-matrix': ['Amazon', 'Microsoft', 'Adobe'],
  'set-matrix-zeroes': ['Amazon', 'Microsoft'],
  'task-scheduler': ['Amazon', 'Meta'],
  'design-twitter': ['Amazon', 'Twitter', 'Atlassian'],
  'k-closest-points-to-origin': ['Amazon', 'Meta', 'Flipkart']
};

const COMPANIES = ['Google', 'Amazon', 'Microsoft', 'Meta', 'Atlassian', 'Uber', 'Adobe', 'Flipkart'];

// Deterministic fallback so every company collection has content: hash the slug to pick companies.
function fallbackCompanies(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const first = COMPANIES[h % COMPANIES.length];
  const second = COMPANIES[(h >> 3) % COMPANIES.length];
  return first === second ? [first] : [first, second];
}

// Flatten the sections into fully-resolved problem records.
function buildProblems() {
  const problems = [];
  for (const group of SECTIONS) {
    group.rows.forEach(([title, slug, dshort], idx) => {
      const difficulty = D[dshort];
      const isBlind = BLIND75.has(slug);
      problems.push({
        title,
        slug,
        difficulty,
        topic: group.topic,
        subtopics: group.sub,
        section: group.section,
        sectionOrder: idx,
        sourcePlatform: 'LEETCODE',
        sourceUrl: `https://leetcode.com/problems/${slug}/`,
        frequencyBand: isBlind ? 'HIGH' : difficulty === 'HARD' ? 'MEDIUM' : 'MEDIUM',
        estimatedTimeMin: EST[difficulty],
        companyTags: COMPANY_TAGS[slug] || fallbackCompanies(slug),
        isBlind75: isBlind
      });
    });
  }
  return problems;
}

const PROBLEMS = buildProblems();

module.exports = { PROBLEMS, SECTIONS, BLIND75, COMPANIES };

// Locally solvable practice problems — the ones the judge actually runs.
//
// The rest of the library (prisma/data/problems.js) is metadata-only: title, topic and a
// link out to the original platform. Those exist so the library and the study sheets have
// breadth, but they cannot be solved here and the solve page links out instead.
//
// This file is the opposite: every problem below has an original statement written for
// NextHire, its own constraints, its own sample and hidden test cases, and starter code for
// each language the judge supports. Nothing here is copied from another platform — these are
// standard, uncopyrightable algorithm exercises stated in our own words.
//
// I/O CONTRACT: the judge pipes `input` to the program's stdin and compares stdout against
// `expectedOutput` after normalising line endings and trailing whitespace. So every statement
// must specify its input format exactly, and every solution reads stdin and prints to stdout.

const PY = 'PYTHON';
const CPP = 'CPP';
const JAVA = 'JAVA';

/** Boilerplate that leaves the reading/printing to the solver but sets the file up correctly. */
const STARTERS = {
  [PY]: 'import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # TODO: solve\n\nmain()\n',
  [CPP]: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // TODO: solve\n    return 0;\n}\n',
  [JAVA]: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        // TODO: solve\n    }\n}\n',
};

const starters = (overrides = {}) =>
  [PY, CPP, JAVA].map((language) => ({ language, template: overrides[language] || STARTERS[language] }));

/**
 * @typedef {{slug:string, title:string, difficulty:'EASY'|'MEDIUM'|'HARD', topic:string,
 *            subtopics?:string[], estimatedTimeMin?:number, timeLimitMs?:number,
 *            memoryLimitMb?:number, description:string, constraints:string,
 *            tests:Array<{input:string, expectedOutput:string, isSample?:boolean, explanation?:string}>,
 *            hints?:string[], editorial?:{content:string, solution:string},
 *            reference:string}} SolvableProblem
 *
 * `reference` is a known-correct Python solution. It is not seeded into the database — the
 * seed uses it to self-check that every test case is consistent before writing anything, so a
 * typo'd expected output can never reach a user as a phantom WRONG_ANSWER.
 */

/** @type {SolvableProblem[]} */
const SOLVABLE = [
  {
    slug: 'nh-sum-two-integers',
    title: 'Sum Two Integers',
    difficulty: 'EASY',
    topic: 'Math',
    subtopics: ['Implementation'],
    estimatedTimeMin: 5,
    description: `Read two integers and print their sum.

This is the warm-up problem: use it to check that your language, the editor and the judge all
behave the way you expect before you start on anything harder.

### Input
A single line containing two space-separated integers \`a\` and \`b\`.

### Output
A single line containing \`a + b\`.

### Example
\`\`\`
Input:  4 7
Output: 11
\`\`\``,
    constraints: '-10^9 <= a, b <= 10^9',
    hints: ['Read the whole line and split it on whitespace.', 'Both values fit comfortably in a 64-bit integer.'],
    editorial: {
      content: 'Parse the two integers and print the sum. The only trap is assuming 32-bit arithmetic in C++/Java — the sum of two values near 10^9 still fits in `int`, but using `long long` costs nothing.',
      solution: 'a, b = map(int, input().split())\nprint(a + b)',
    },
    reference: 'import sys\na, b = map(int, sys.stdin.read().split())\nprint(a + b)',
    tests: [
      { input: '4 7', expectedOutput: '11', isSample: true, explanation: '4 + 7 = 11' },
      { input: '-3 3', expectedOutput: '0', isSample: true, explanation: 'Negative values are allowed.' },
      { input: '1000000000 1000000000', expectedOutput: '2000000000' },
      { input: '-1000000000 -1000000000', expectedOutput: '-2000000000' },
      { input: '0 0', expectedOutput: '0' },
    ],
  },

  {
    slug: 'nh-reverse-string',
    title: 'Reverse a String',
    difficulty: 'EASY',
    topic: 'Strings',
    subtopics: ['Two Pointers'],
    estimatedTimeMin: 8,
    description: `Print a string with its characters in reverse order.

### Input
A single line containing a string \`s\` of visible ASCII characters (no spaces).

### Output
The characters of \`s\` in reverse order.

### Example
\`\`\`
Input:  interview
Output: weivretni
\`\`\``,
    constraints: '1 <= |s| <= 100000, s contains no whitespace',
    hints: ['Most languages can reverse a string in one call.', 'If you swap in place, walk one pointer from each end towards the middle.'],
    editorial: {
      content: 'Either use the language built-in or swap `s[i]` with `s[n-1-i]` for `i < n/2`. Both are O(n) time; the in-place swap is O(1) extra space.',
      solution: 'print(input().strip()[::-1])',
    },
    reference: 'import sys\nprint(sys.stdin.read().strip()[::-1])',
    tests: [
      { input: 'interview', expectedOutput: 'weivretni', isSample: true, explanation: 'Read the letters right to left.' },
      { input: 'a', expectedOutput: 'a', isSample: true, explanation: 'A single character is its own reverse.' },
      { input: 'racecar', expectedOutput: 'racecar' },
      { input: 'NextHire2026', expectedOutput: '6202eriHtxeN' },
      { input: 'ab', expectedOutput: 'ba' },
    ],
  },

  {
    slug: 'nh-count-vowels',
    title: 'Count the Vowels',
    difficulty: 'EASY',
    topic: 'Strings',
    subtopics: ['Hashing'],
    estimatedTimeMin: 8,
    description: `Count how many vowels a line of text contains.

A vowel is any of \`a\`, \`e\`, \`i\`, \`o\`, \`u\`, in either upper or lower case.

### Input
A single line of text, which may contain spaces.

### Output
A single integer: the number of vowels in the line.

### Example
\`\`\`
Input:  Practice makes progress
Output: 7
\`\`\``,
    constraints: '1 <= line length <= 100000',
    hints: ['Normalise the case once instead of testing both cases per character.', 'A set membership test is clearer than a chain of comparisons.'],
    editorial: {
      content: 'Lower-case each character and test membership in the set `{a,e,i,o,u}`. One pass, O(n) time and O(1) space.',
      solution: "line = input()\nprint(sum(1 for c in line.lower() if c in 'aeiou'))",
    },
    reference: "import sys\nline = sys.stdin.readline().rstrip('\\n')\nprint(sum(1 for c in line.lower() if c in 'aeiou'))",
    tests: [
      { input: 'Practice makes progress', expectedOutput: '7', isSample: true, explanation: 'Pr[a]ct[i]c[e] m[a]k[e]s pr[o]gr[e]ss — 7 vowels.' },
      { input: 'xyz', expectedOutput: '0', isSample: true, explanation: 'No vowels at all.' },
      { input: 'AEIOU aeiou', expectedOutput: '10' },
      { input: 'The quick brown fox jumps over the lazy dog', expectedOutput: '11' },
      { input: 'b', expectedOutput: '0' },
    ],
  },

  {
    slug: 'nh-valid-brackets',
    title: 'Balanced Brackets',
    difficulty: 'EASY',
    topic: 'Stack',
    subtopics: ['Strings'],
    estimatedTimeMin: 15,
    description: `Decide whether a string of brackets is balanced.

A string is balanced when every opening bracket is closed by the matching kind of bracket, in
the right order, and nothing is left over. The bracket kinds are \`()\`, \`[]\` and \`{}\`.

### Input
A single line containing a string made only of the characters \`([{}])\`.

### Output
Print \`YES\` if the string is balanced, otherwise \`NO\`.

### Example
\`\`\`
Input:  {[()]}
Output: YES
\`\`\`
\`\`\`
Input:  ([)]
Output: NO
\`\`\``,
    constraints: '1 <= |s| <= 100000',
    hints: [
      'Push every opening bracket onto a stack.',
      'On a closing bracket, the top of the stack must be its matching opener — otherwise the answer is NO.',
      'Do not forget to check that the stack is empty at the end.',
    ],
    editorial: {
      content: 'Scan left to right with a stack. Push openers; on a closer, pop and compare. Reject early on a mismatch or a pop from an empty stack, and reject at the end if anything is left unclosed. O(n) time, O(n) space.',
      solution: "s = input().strip()\npairs = {')': '(', ']': '[', '}': '{'}\nstack = []\nok = True\nfor c in s:\n    if c in '([{':\n        stack.append(c)\n    else:\n        if not stack or stack.pop() != pairs[c]:\n            ok = False\n            break\nprint('YES' if ok and not stack else 'NO')",
    },
    reference: "import sys\ns = sys.stdin.read().strip()\npairs = {')': '(', ']': '[', '}': '{'}\nstack = []\nok = True\nfor c in s:\n    if c in '([{':\n        stack.append(c)\n    else:\n        if not stack or stack.pop() != pairs[c]:\n            ok = False\n            break\nprint('YES' if ok and not stack else 'NO')",
    tests: [
      { input: '{[()]}', expectedOutput: 'YES', isSample: true, explanation: 'Every bracket closes in the right order.' },
      { input: '([)]', expectedOutput: 'NO', isSample: true, explanation: 'The ) closes a [ — wrong kind.' },
      { input: '()', expectedOutput: 'YES' },
      { input: '(', expectedOutput: 'NO' },
      { input: ')(', expectedOutput: 'NO' },
      { input: '{{[[(())]]}}', expectedOutput: 'YES' },
      { input: '[({})](]', expectedOutput: 'NO' },
    ],
  },

  {
    slug: 'nh-binary-search-index',
    title: 'Find a Value by Binary Search',
    difficulty: 'EASY',
    topic: 'Binary Search',
    subtopics: ['Arrays'],
    estimatedTimeMin: 15,
    description: `Find the position of a value in a sorted array.

### Input
- Line 1: two integers \`n\` and \`target\`.
- Line 2: \`n\` space-separated integers in non-decreasing order.

### Output
The 0-based index of \`target\` in the array, or \`-1\` if it is not present. The values are
distinct, so the answer is unambiguous.

### Example
\`\`\`
Input:
5 7
1 3 5 7 9

Output:
3
\`\`\``,
    constraints: '1 <= n <= 200000, -10^9 <= values, target <= 10^9, values are distinct and sorted ascending',
    hints: [
      'A linear scan is O(n) and will pass the samples — but the point of this problem is the O(log n) version.',
      'Keep the invariant "if the target exists, it is inside [lo, hi]" and shrink the window by half each step.',
      'Compute the midpoint in a way that cannot overflow: lo + (hi - lo) / 2.',
    ],
    editorial: {
      content: 'Standard binary search. Maintain `lo = 0`, `hi = n - 1`; compare the middle element to the target and discard the half that cannot contain it. Terminate when `lo > hi` and report -1. O(log n) time, O(1) space.',
      solution: 'import sys\ndata = sys.stdin.read().split()\nn, target = int(data[0]), int(data[1])\narr = list(map(int, data[2:2 + n]))\nlo, hi, ans = 0, n - 1, -1\nwhile lo <= hi:\n    mid = lo + (hi - lo) // 2\n    if arr[mid] == target:\n        ans = mid\n        break\n    if arr[mid] < target:\n        lo = mid + 1\n    else:\n        hi = mid - 1\nprint(ans)',
    },
    reference: 'import sys\ndata = sys.stdin.read().split()\nn, target = int(data[0]), int(data[1])\narr = list(map(int, data[2:2 + n]))\nlo, hi, ans = 0, n - 1, -1\nwhile lo <= hi:\n    mid = lo + (hi - lo) // 2\n    if arr[mid] == target:\n        ans = mid\n        break\n    if arr[mid] < target:\n        lo = mid + 1\n    else:\n        hi = mid - 1\nprint(ans)',
    tests: [
      { input: '5 7\n1 3 5 7 9', expectedOutput: '3', isSample: true, explanation: '7 sits at index 3.' },
      { input: '5 4\n1 3 5 7 9', expectedOutput: '-1', isSample: true, explanation: '4 is not in the array.' },
      { input: '1 1\n1', expectedOutput: '0' },
      { input: '1 2\n1', expectedOutput: '-1' },
      { input: '6 1\n1 2 3 4 5 6', expectedOutput: '0' },
      { input: '6 6\n1 2 3 4 5 6', expectedOutput: '5' },
      { input: '4 -5\n-9 -5 0 12', expectedOutput: '1' },
    ],
  },

  {
    slug: 'nh-max-subarray-sum',
    title: 'Maximum Subarray Sum',
    difficulty: 'MEDIUM',
    topic: 'Dynamic Programming',
    subtopics: ['Arrays', 'Greedy'],
    estimatedTimeMin: 25,
    description: `Find the largest sum obtainable from a contiguous, non-empty slice of an array.

### Input
- Line 1: an integer \`n\`.
- Line 2: \`n\` space-separated integers.

### Output
A single integer: the maximum sum over all non-empty contiguous subarrays.

### Example
\`\`\`
Input:
9
-2 1 -3 4 -1 2 1 -5 4

Output:
6
\`\`\`
The slice \`4 -1 2 1\` sums to 6, and nothing does better.

Note that the subarray must be non-empty, so an array of all-negative numbers answers with its
largest single element rather than 0.`,
    constraints: '1 <= n <= 200000, -10^9 <= a[i] <= 10^9',
    hints: [
      'The answer either ends at index i or it does not — that is the whole recurrence.',
      'best_ending_here = max(a[i], best_ending_here + a[i]).',
      'Track the running best separately from the best ending at the current index.',
    ],
    editorial: {
      content: "Kadane's algorithm. Walk the array keeping `cur`, the best sum of a subarray ending at the current index: either extend the previous one or start fresh at `a[i]`. The answer is the maximum `cur` ever seen. Initialise both to `a[0]` rather than 0 so all-negative inputs are handled. O(n) time, O(1) space. Use 64-bit accumulators: 200000 * 10^9 overflows 32 bits.",
      solution: 'import sys\ndata = sys.stdin.read().split()\nn = int(data[0])\narr = list(map(int, data[1:1 + n]))\nbest = cur = arr[0]\nfor x in arr[1:]:\n    cur = max(x, cur + x)\n    best = max(best, cur)\nprint(best)',
    },
    reference: 'import sys\ndata = sys.stdin.read().split()\nn = int(data[0])\narr = list(map(int, data[1:1 + n]))\nbest = cur = arr[0]\nfor x in arr[1:]:\n    cur = max(x, cur + x)\n    best = max(best, cur)\nprint(best)',
    tests: [
      { input: '9\n-2 1 -3 4 -1 2 1 -5 4', expectedOutput: '6', isSample: true, explanation: 'The slice 4 -1 2 1 sums to 6.' },
      { input: '5\n-5 -2 -9 -1 -7', expectedOutput: '-1', isSample: true, explanation: 'All negative, so the best is the single largest element.' },
      { input: '1\n7', expectedOutput: '7' },
      { input: '1\n-7', expectedOutput: '-7' },
      { input: '4\n1 2 3 4', expectedOutput: '10' },
      { input: '6\n5 -1 5 -1 5 -100', expectedOutput: '13' },
      { input: '3\n1000000000 1000000000 1000000000', expectedOutput: '3000000000' },
    ],
  },

  {
    slug: 'nh-two-sum-indices',
    title: 'Two Sum (Indices)',
    difficulty: 'MEDIUM',
    topic: 'Hashing',
    subtopics: ['Arrays'],
    estimatedTimeMin: 20,
    description: `Find the two positions in an array whose values add up to a target.

### Input
- Line 1: two integers \`n\` and \`target\`.
- Line 2: \`n\` space-separated integers.

### Output
The two 0-based indices, smaller first, separated by a space. If no pair works, print \`-1\`.
The input guarantees at most one valid pair.

### Example
\`\`\`
Input:
4 9
2 7 11 15

Output:
0 1
\`\`\``,
    constraints: '2 <= n <= 200000, -10^9 <= a[i], target <= 10^9, at most one valid pair exists',
    hints: [
      'The brute-force pair loop is O(n^2) — fine for the samples, too slow for the limits.',
      'While scanning, ask "have I already seen target - a[i]?"',
      'A hash map from value to the index where you first saw it answers that in O(1).',
    ],
    editorial: {
      content: 'One pass with a hash map from value to index. At index `i`, look up `target - a[i]`; if it is present, that earlier index and `i` are the answer (and it is already the smaller one first). Otherwise record `a[i] -> i` and continue. O(n) time, O(n) space.',
      solution: 'import sys\ndata = sys.stdin.read().split()\nn, target = int(data[0]), int(data[1])\narr = list(map(int, data[2:2 + n]))\nseen = {}\nfor i, x in enumerate(arr):\n    if target - x in seen:\n        print(seen[target - x], i)\n        break\n    if x not in seen:\n        seen[x] = i\nelse:\n    print(-1)',
    },
    reference: 'import sys\ndata = sys.stdin.read().split()\nn, target = int(data[0]), int(data[1])\narr = list(map(int, data[2:2 + n]))\nseen = {}\nfor i, x in enumerate(arr):\n    if target - x in seen:\n        print(seen[target - x], i)\n        break\n    if x not in seen:\n        seen[x] = i\nelse:\n    print(-1)',
    tests: [
      { input: '4 9\n2 7 11 15', expectedOutput: '0 1', isSample: true, explanation: '2 + 7 = 9.' },
      { input: '4 100\n2 7 11 15', expectedOutput: '-1', isSample: true, explanation: 'No pair sums to 100.' },
      { input: '2 0\n-5 5', expectedOutput: '0 1' },
      { input: '5 10\n1 2 3 4 6', expectedOutput: '3 4' },
      { input: '3 6\n3 2 3', expectedOutput: '0 2' },
    ],
  },

  {
    slug: 'nh-longest-unique-substring',
    title: 'Longest Substring Without Repeats',
    difficulty: 'MEDIUM',
    topic: 'Sliding Window',
    subtopics: ['Strings', 'Hashing'],
    estimatedTimeMin: 25,
    description: `Find the length of the longest run of characters in a string with no repeats.

A *substring* is contiguous — you may not skip characters.

### Input
A single line containing a string \`s\` of lower-case letters and digits (no spaces).

### Output
A single integer: the length of the longest substring of \`s\` whose characters are all distinct.

### Example
\`\`\`
Input:  abcabcbb
Output: 3
\`\`\`
\`abc\` has length 3; every longer window repeats a character.`,
    constraints: '1 <= |s| <= 200000, s contains only [a-z0-9]',
    hints: [
      'Keep a window [left, right] that always holds distinct characters.',
      'When the character at right has been seen inside the window, move left past its previous occurrence — never backwards.',
      'Store the last index at which you saw each character.',
    ],
    editorial: {
      content: 'Sliding window with a last-seen map. Extend `right` one character at a time; if that character was last seen at position `p >= left`, jump `left` to `p + 1`. The answer is the largest `right - left + 1`. Each index is visited by each pointer at most once, so O(n) time and O(alphabet) space.',
      solution: 's = input().strip()\nlast = {}\nleft = 0\nbest = 0\nfor right, c in enumerate(s):\n    if c in last and last[c] >= left:\n        left = last[c] + 1\n    last[c] = right\n    best = max(best, right - left + 1)\nprint(best)',
    },
    reference: 'import sys\ns = sys.stdin.read().strip()\nlast = {}\nleft = 0\nbest = 0\nfor right, c in enumerate(s):\n    if c in last and last[c] >= left:\n        left = last[c] + 1\n    last[c] = right\n    best = max(best, right - left + 1)\nprint(best)',
    tests: [
      { input: 'abcabcbb', expectedOutput: '3', isSample: true, explanation: 'abc is the longest repeat-free run.' },
      { input: 'bbbbb', expectedOutput: '1', isSample: true, explanation: 'Every window longer than one character repeats b.' },
      { input: 'pwwkew', expectedOutput: '3' },
      { input: 'a', expectedOutput: '1' },
      { input: 'abcdefghij', expectedOutput: '10' },
      { input: 'dvdf', expectedOutput: '3' },
      { input: 'abba', expectedOutput: '2' },
    ],
  },

  {
    slug: 'nh-merge-sorted-arrays',
    title: 'Merge Two Sorted Arrays',
    difficulty: 'EASY',
    topic: 'Two Pointers',
    subtopics: ['Arrays', 'Sorting'],
    estimatedTimeMin: 15,
    description: `Merge two already-sorted arrays into one sorted array.

### Input
- Line 1: two integers \`n\` and \`m\`.
- Line 2: \`n\` space-separated integers in non-decreasing order.
- Line 3: \`m\` space-separated integers in non-decreasing order.

If an array is empty its line is present but blank.

### Output
All \`n + m\` values in non-decreasing order, space-separated on one line. If both arrays are
empty, print an empty line.

### Example
\`\`\`
Input:
3 3
1 3 5
2 4 6

Output:
1 2 3 4 5 6
\`\`\``,
    constraints: '0 <= n, m <= 200000, 1 <= n + m, -10^9 <= values <= 10^9',
    hints: [
      'Concatenating and sorting works and is O((n+m) log(n+m)) — the intended answer is O(n+m).',
      'Walk one index into each array and always take the smaller head.',
      'When one array runs out, append the rest of the other.',
    ],
    editorial: {
      content: 'Classic two-pointer merge, the merge half of merge sort. Compare the heads of the two arrays, emit the smaller, advance that pointer; when either is exhausted, append the remainder of the other. O(n + m) time.',
      solution: 'import sys\ndata = sys.stdin.read().split()\nn, m = int(data[0]), int(data[1])\na = list(map(int, data[2:2 + n]))\nb = list(map(int, data[2 + n:2 + n + m]))\nout = []\ni = j = 0\nwhile i < n and j < m:\n    if a[i] <= b[j]:\n        out.append(a[i]); i += 1\n    else:\n        out.append(b[j]); j += 1\nout.extend(a[i:])\nout.extend(b[j:])\nprint(" ".join(map(str, out)))',
    },
    reference: 'import sys\ndata = sys.stdin.read().split()\nn, m = int(data[0]), int(data[1])\na = list(map(int, data[2:2 + n]))\nb = list(map(int, data[2 + n:2 + n + m]))\nout = []\ni = j = 0\nwhile i < n and j < m:\n    if a[i] <= b[j]:\n        out.append(a[i]); i += 1\n    else:\n        out.append(b[j]); j += 1\nout.extend(a[i:])\nout.extend(b[j:])\nprint(" ".join(map(str, out)))',
    tests: [
      { input: '3 3\n1 3 5\n2 4 6', expectedOutput: '1 2 3 4 5 6', isSample: true, explanation: 'Interleaved in order.' },
      { input: '3 0\n1 2 3\n', expectedOutput: '1 2 3', isSample: true, explanation: 'The second array is empty.' },
      { input: '0 2\n\n4 8', expectedOutput: '4 8' },
      { input: '2 2\n1 1\n1 1', expectedOutput: '1 1 1 1' },
      { input: '3 2\n-5 0 9\n-9 -7', expectedOutput: '-9 -7 -5 0 9' },
      { input: '1 1\n2\n1', expectedOutput: '1 2' },
    ],
  },

  {
    slug: 'nh-climbing-stairs',
    title: 'Counting Ways Up the Stairs',
    difficulty: 'EASY',
    topic: 'Dynamic Programming',
    subtopics: ['Math'],
    estimatedTimeMin: 15,
    description: `You are climbing a staircase of \`n\` steps. Each move takes you up either 1 step or 2 steps.
Count the distinct sequences of moves that get you to the top.

Because the count grows fast, print it modulo \`1000000007\`.

### Input
A single integer \`n\`.

### Output
The number of distinct ways to climb \`n\` steps, modulo \`1000000007\`.

### Example
\`\`\`
Input:  4
Output: 5
\`\`\`
The five sequences are 1+1+1+1, 1+1+2, 1+2+1, 2+1+1 and 2+2.`,
    constraints: '1 <= n <= 1000000',
    hints: [
      'The last move was either a 1 or a 2 — so ways(n) = ways(n-1) + ways(n-2).',
      'That is the Fibonacci sequence with a shifted index.',
      'Iterate with two rolling variables; recursion will blow the stack at n = 10^6.',
    ],
    editorial: {
      content: 'Let `f(n)` be the number of ways. The final move is either 1 step (leaving `f(n-1)` ways to reach the step below) or 2 steps (`f(n-2)`), so `f(n) = f(n-1) + f(n-2)` with `f(1) = 1` and `f(2) = 2`. Iterate bottom-up with two variables, reducing mod 1e9+7 each step. O(n) time, O(1) space.',
      solution: 'MOD = 1000000007\nn = int(input())\na, b = 1, 2\nif n == 1:\n    print(1)\nelse:\n    for _ in range(n - 2):\n        a, b = b, (a + b) % MOD\n    print(b % MOD)',
    },
    reference: 'import sys\nMOD = 1000000007\nn = int(sys.stdin.read().split()[0])\nif n == 1:\n    print(1)\nelse:\n    a, b = 1, 2\n    for _ in range(n - 2):\n        a, b = b, (a + b) % MOD\n    print(b % MOD)',
    tests: [
      { input: '4', expectedOutput: '5', isSample: true, explanation: 'Five distinct move sequences.' },
      { input: '1', expectedOutput: '1', isSample: true, explanation: 'Only one way: a single 1-step move.' },
      { input: '2', expectedOutput: '2' },
      { input: '10', expectedOutput: '89' },
      { input: '50', expectedOutput: '365010934' },
      { input: '1000000', expectedOutput: '534400663' },
    ],
  },

  {
    slug: 'nh-count-islands',
    title: 'Count the Islands',
    difficulty: 'MEDIUM',
    topic: 'Graphs',
    subtopics: ['DFS', 'BFS'],
    estimatedTimeMin: 30,
    description: `Count the connected landmasses in a grid map.

The map is a grid of \`1\` (land) and \`0\` (water). An island is a maximal group of land cells
connected to each other **horizontally or vertically** — diagonal contact does not connect two
cells.

### Input
- Line 1: two integers \`r\` and \`c\` — the number of rows and columns.
- The next \`r\` lines: each a string of exactly \`c\` characters, either \`0\` or \`1\`.

### Output
A single integer: the number of islands.

### Example
\`\`\`
Input:
4 5
11000
11000
00100
00011

Output:
3
\`\`\``,
    constraints: '1 <= r, c <= 500',
    timeLimitMs: 4000,
    hints: [
      'Scan every cell. When you find land you have not visited, you have found a new island.',
      'From that cell, flood-fill every reachable land cell and mark it visited so it is not counted again.',
      'A recursive DFS can overflow the stack on a 500x500 all-land grid — prefer an explicit stack or a BFS queue.',
    ],
    editorial: {
      content: 'Iterate over all cells. Each time an unvisited land cell appears, increment the counter and flood-fill its whole component (iterative DFS with an explicit stack, or BFS) marking cells visited. Every cell is pushed at most once, so the whole scan is O(r * c).',
      solution: 'import sys\ndata = sys.stdin.read().split()\nr, c = int(data[0]), int(data[1])\ngrid = [list(row) for row in data[2:2 + r]]\ncount = 0\nfor i in range(r):\n    for j in range(c):\n        if grid[i][j] != "1":\n            continue\n        count += 1\n        stack = [(i, j)]\n        grid[i][j] = "0"\n        while stack:\n            y, x = stack.pop()\n            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):\n                ny, nx = y + dy, x + dx\n                if 0 <= ny < r and 0 <= nx < c and grid[ny][nx] == "1":\n                    grid[ny][nx] = "0"\n                    stack.append((ny, nx))\nprint(count)',
    },
    reference: 'import sys\ndata = sys.stdin.read().split()\nr, c = int(data[0]), int(data[1])\ngrid = [list(row) for row in data[2:2 + r]]\ncount = 0\nfor i in range(r):\n    for j in range(c):\n        if grid[i][j] != "1":\n            continue\n        count += 1\n        stack = [(i, j)]\n        grid[i][j] = "0"\n        while stack:\n            y, x = stack.pop()\n            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):\n                ny, nx = y + dy, x + dx\n                if 0 <= ny < r and 0 <= nx < c and grid[ny][nx] == "1":\n                    grid[ny][nx] = "0"\n                    stack.append((ny, nx))\nprint(count)',
    tests: [
      { input: '4 5\n11000\n11000\n00100\n00011', expectedOutput: '3', isSample: true, explanation: 'A 2x2 block, a single cell, and a horizontal pair.' },
      { input: '3 3\n000\n000\n000', expectedOutput: '0', isSample: true, explanation: 'All water.' },
      { input: '1 1\n1', expectedOutput: '1' },
      { input: '3 3\n101\n010\n101', expectedOutput: '5' },
      { input: '2 4\n1111\n1111', expectedOutput: '1' },
      { input: '4 4\n1001\n0110\n0110\n1001', expectedOutput: '5' },
    ],
  },

  {
    slug: 'nh-coin-change-min',
    title: 'Fewest Coins',
    difficulty: 'MEDIUM',
    topic: 'Dynamic Programming',
    subtopics: ['Greedy'],
    estimatedTimeMin: 30,
    description: `Make an exact amount using as few coins as possible.

You have an unlimited supply of each coin denomination.

### Input
- Line 1: two integers \`k\` (how many denominations) and \`amount\`.
- Line 2: \`k\` space-separated positive integers, the coin values.

### Output
The smallest number of coins that sum to exactly \`amount\`, or \`-1\` if the amount cannot be
made. Making 0 needs 0 coins.

### Example
\`\`\`
Input:
3 11
1 2 5

Output:
3
\`\`\`
11 = 5 + 5 + 1.`,
    constraints: '1 <= k <= 20, 0 <= amount <= 100000, 1 <= coin value <= 100000',
    timeLimitMs: 4000,
    hints: [
      'Taking the largest coin first is not always optimal — try coins {1, 3, 4} for amount 6.',
      'Define best[v] = fewest coins to make exactly v, and build it upwards from 0.',
      'best[v] = 1 + min(best[v - coin]) over every coin that fits.',
    ],
    editorial: {
      content: 'Bottom-up DP over amounts. Initialise `best[0] = 0` and everything else to infinity, then for each amount `v` from 1 upward take `best[v] = 1 + min(best[v - coin])` over coins with `coin <= v`. Report `best[amount]`, or -1 if it is still infinity. O(k * amount) time, O(amount) space. A greedy largest-coin-first strategy is wrong in general — it fails on {1,3,4} for 6, where greedy gives 4+1+1 = 3 coins but 3+3 = 2 is optimal.',
      solution: 'import sys\ndata = sys.stdin.read().split()\nk, amount = int(data[0]), int(data[1])\ncoins = list(map(int, data[2:2 + k]))\nINF = float("inf")\nbest = [0] + [INF] * amount\nfor v in range(1, amount + 1):\n    for coin in coins:\n        if coin <= v and best[v - coin] + 1 < best[v]:\n            best[v] = best[v - coin] + 1\nprint(best[amount] if best[amount] != INF else -1)',
    },
    reference: 'import sys\ndata = sys.stdin.read().split()\nk, amount = int(data[0]), int(data[1])\ncoins = list(map(int, data[2:2 + k]))\nINF = float("inf")\nbest = [0] + [INF] * amount\nfor v in range(1, amount + 1):\n    for coin in coins:\n        if coin <= v and best[v - coin] + 1 < best[v]:\n            best[v] = best[v - coin] + 1\nprint(best[amount] if best[amount] != INF else -1)',
    tests: [
      { input: '3 11\n1 2 5', expectedOutput: '3', isSample: true, explanation: '5 + 5 + 1.' },
      { input: '1 3\n2', expectedOutput: '-1', isSample: true, explanation: 'Odd amounts cannot be made from 2s alone.' },
      { input: '3 6\n1 3 4', expectedOutput: '2' },
      { input: '2 0\n1 5', expectedOutput: '0' },
      { input: '3 100\n1 5 25', expectedOutput: '4' },
      { input: '1 100000\n1', expectedOutput: '100000' },
    ],
  },
];

module.exports = { SOLVABLE, starters, STARTERS };

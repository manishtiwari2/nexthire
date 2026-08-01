import type { SupportedLanguage } from '../../store/useEditorStore';

// Quick-reference cheatsheets shown in the editor's Docs panel. These are GENERIC language
// references (I/O patterns, syntax, common data structures) to help candidates recall
// conventions during an assessment — they intentionally contain NO problem-specific logic
// or solution hints.

export interface DocSnippet {
  label: string;
  code: string;
}
export interface DocSection {
  title: string;
  snippets: DocSnippet[];
}
export interface LanguageDoc {
  name: string;
  note: string;
  sections: DocSection[];
}

export const LANGUAGE_REFERENCE: Record<SupportedLanguage, LanguageDoc> = {
  python: {
    name: 'Python 3',
    note: 'Input comes from stdin; print your answer to stdout. Use fast I/O for large inputs.',
    sections: [
      {
        title: 'Reading input',
        snippets: [
          { label: 'Single integer', code: 'n = int(input())' },
          { label: 'Two values on one line (space-separated)', code: 'a, b = map(int, input().split())' },
          { label: 'Comma-separated values', code: "a, b = map(int, input().split(','))" },
          { label: 'List of integers (one line)', code: 'arr = list(map(int, input().split()))' },
          { label: 'A single string / word', code: 's = input().strip()' },
          { label: 'N, then N integers on the next line', code: 'n = int(input())\narr = list(map(int, input().split()))' },
          { label: 'Matrix: R rows of C integers', code: 'r, c = map(int, input().split())\nmat = [list(map(int, input().split())) for _ in range(r)]' },
        ],
      },
      {
        title: 'Fast I/O (large inputs)',
        snippets: [
          { label: 'Faster line reader', code: 'import sys\ninput = sys.stdin.readline' },
          { label: 'Read everything, then tokenize', code: 'import sys\ndata = sys.stdin.buffer.read().split()' },
          { label: 'Batch output', code: 'import sys\nsys.stdout.write("\\n".join(map(str, results)) + "\\n")' },
        ],
      },
      {
        title: 'Writing output',
        snippets: [
          { label: 'Print a value', code: 'print(ans)' },
          { label: 'Print several, space-separated', code: 'print(a, b)          # or: print(*arr)' },
          { label: 'Join a list into one line', code: "print(' '.join(map(str, arr)))" },
        ],
      },
      {
        title: 'Loops & conditionals',
        snippets: [
          { label: 'For loop', code: 'for i in range(n):\n    ...' },
          { label: 'While loop', code: 'while lo < hi:\n    ...' },
          { label: 'If / elif / else', code: 'if x > 0:\n    ...\nelif x == 0:\n    ...\nelse:\n    ...' },
        ],
      },
      {
        title: 'Functions',
        snippets: [
          { label: 'Define & call', code: 'def solve(x):\n    return x * x\n\nprint(solve(5))' },
        ],
      },
      {
        title: 'Common data structures',
        snippets: [
          { label: 'List / dict / set', code: 'lst = []\nmp = {}\nst = set()' },
          { label: 'Stack & queue (deque)', code: 'from collections import deque\ndq = deque()\ndq.append(x); dq.pop()       # stack\ndq.appendleft(x); dq.pop()   # queue' },
          { label: 'Heap (min-heap)', code: 'import heapq\nh = []\nheapq.heappush(h, x)\nsmallest = heapq.heappop(h)' },
          { label: 'Counter / defaultdict', code: 'from collections import Counter, defaultdict\ncnt = Counter(arr)\ng = defaultdict(list)' },
        ],
      },
      {
        title: 'Essentials',
        snippets: [
          { label: 'Sort (with key)', code: 'arr.sort()\narr.sort(key=lambda x: (-x[1], x[0]))' },
          { label: 'Recursion depth (deep recursion)', code: 'import sys\nsys.setrecursionlimit(10**6)' },
        ],
      },
    ],
  },

  java: {
    name: 'Java 17',
    note: 'Your class MUST be named Main with a public static void main. Use BufferedReader for speed.',
    sections: [
      {
        title: 'Reading input',
        snippets: [
          { label: 'Setup (fast reader)', code: 'BufferedReader br = new BufferedReader(new InputStreamReader(System.in));' },
          { label: 'Single integer', code: 'int n = Integer.parseInt(br.readLine().trim());' },
          { label: 'Two values on one line', code: 'StringTokenizer st = new StringTokenizer(br.readLine());\nint a = Integer.parseInt(st.nextToken());\nint b = Integer.parseInt(st.nextToken());' },
          { label: 'Comma-separated values', code: 'String[] p = br.readLine().trim().split(",");\nint a = Integer.parseInt(p[0]), b = Integer.parseInt(p[1]);' },
          { label: 'Array of integers (one line)', code: 'int[] arr = Arrays.stream(br.readLine().trim().split("\\\\s+"))\n        .mapToInt(Integer::parseInt).toArray();' },
          { label: 'Matrix: R rows of C integers', code: 'int[][] mat = new int[r][c];\nfor (int i = 0; i < r; i++) {\n    StringTokenizer t = new StringTokenizer(br.readLine());\n    for (int j = 0; j < c; j++) mat[i][j] = Integer.parseInt(t.nextToken());\n}' },
          { label: 'Simple alternative (Scanner)', code: 'Scanner sc = new Scanner(System.in);\nint n = sc.nextInt();\nString s = sc.next();' },
        ],
      },
      {
        title: 'Writing output',
        snippets: [
          { label: 'Print a value', code: 'System.out.println(ans);' },
          { label: 'Fast batched output', code: 'StringBuilder sb = new StringBuilder();\nfor (int x : results) sb.append(x).append("\\n");\nSystem.out.print(sb);' },
        ],
      },
      {
        title: 'Loops & conditionals',
        snippets: [
          { label: 'For loop', code: 'for (int i = 0; i < n; i++) {\n    ...\n}' },
          { label: 'For-each', code: 'for (int x : arr) {\n    ...\n}' },
          { label: 'If / else', code: 'if (x > 0) {\n    ...\n} else {\n    ...\n}' },
        ],
      },
      {
        title: 'Methods',
        snippets: [
          { label: 'Static helper (callable from main)', code: 'static int solve(int x) {\n    return x * x;\n}' },
        ],
      },
      {
        title: 'Common data structures',
        snippets: [
          { label: 'Dynamic array & map & set', code: 'List<Integer> list = new ArrayList<>();\nMap<Integer,Integer> map = new HashMap<>();\nSet<Integer> set = new HashSet<>();' },
          { label: 'Stack & queue (ArrayDeque)', code: 'Deque<Integer> stack = new ArrayDeque<>();  // push/pop\nDeque<Integer> queue = new ArrayDeque<>();  // offer/poll' },
          { label: 'Heap (PriorityQueue)', code: 'PriorityQueue<Integer> pq = new PriorityQueue<>();          // min-heap\nPriorityQueue<Integer> mx = new PriorityQueue<>(Collections.reverseOrder());' },
          { label: 'Sorted map', code: 'TreeMap<Integer,Integer> tm = new TreeMap<>();' },
        ],
      },
      {
        title: 'Essentials',
        snippets: [
          { label: 'Sort arrays / lists', code: 'Arrays.sort(arr);\nCollections.sort(list);\nlist.sort((x, y) -> y - x);   // descending' },
        ],
      },
    ],
  },

  cpp: {
    name: 'C++ 20',
    note: 'Add fast I/O at the top of main(). #include <bits/stdc++.h> pulls in the whole STL.',
    sections: [
      {
        title: 'Reading input',
        snippets: [
          { label: 'Fast I/O (put first in main)', code: 'ios::sync_with_stdio(false);\ncin.tie(nullptr);' },
          { label: 'Single integer', code: 'int n;\ncin >> n;' },
          { label: 'Two values', code: 'int a, b;\ncin >> a >> b;' },
          { label: 'Array of n integers', code: 'int n; cin >> n;\nvector<int> a(n);\nfor (auto &x : a) cin >> x;' },
          { label: 'A whole line (with spaces)', code: 'string line;\ngetline(cin, line);' },
          { label: 'Matrix: R x C', code: 'int r, c; cin >> r >> c;\nvector<vector<int>> mat(r, vector<int>(c));\nfor (int i = 0; i < r; i++)\n    for (int j = 0; j < c; j++) cin >> mat[i][j];' },
        ],
      },
      {
        title: 'Writing output',
        snippets: [
          { label: 'Print a value', code: 'cout << ans << "\\n";' },
          { label: 'Print a vector', code: 'for (int x : a) cout << x << " ";\ncout << "\\n";' },
        ],
      },
      {
        title: 'Loops & conditionals',
        snippets: [
          { label: 'For loop', code: 'for (int i = 0; i < n; i++) {\n    ...\n}' },
          { label: 'Range-based for', code: 'for (auto &x : a) {\n    ...\n}' },
          { label: 'If / else', code: 'if (x > 0) {\n    ...\n} else {\n    ...\n}' },
        ],
      },
      {
        title: 'Functions',
        snippets: [
          { label: 'Define & call', code: 'int solve(int x) {\n    return x * x;\n}' },
        ],
      },
      {
        title: 'Common data structures',
        snippets: [
          { label: 'Vector / map / set', code: 'vector<int> v;\nmap<int,int> m;              // or unordered_map\nset<int> s;                  // or unordered_set' },
          { label: 'Stack, queue, deque', code: 'stack<int> st;\nqueue<int> q;\ndeque<int> dq;' },
          { label: 'Heap (priority_queue)', code: 'priority_queue<int> maxHeap;\npriority_queue<int, vector<int>, greater<int>> minHeap;' },
          { label: 'Pair', code: 'pair<int,int> p = {1, 2};\nauto [x, y] = p;' },
        ],
      },
      {
        title: 'Essentials',
        snippets: [
          { label: 'Sort (with comparator)', code: 'sort(a.begin(), a.end());\nsort(a.begin(), a.end(), [](int x, int y){ return x > y; });' },
        ],
      },
    ],
  },
};

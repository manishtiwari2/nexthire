import type { SupportedLanguage } from '../../store/useEditorStore';

// Default per-language skeletons. Used so the editor is NEVER empty: if a question doesn't
// ship a starter template for the chosen language, we fall back to one of these. They read
// from stdin and write to stdout, matching how the judge feeds test cases.
export const STARTER_TEMPLATES: Record<SupportedLanguage, string> = {
  python: `import sys

def solve():
    # Read input from stdin, print your answer to stdout.
    data = sys.stdin.read().split()
    # ...

if __name__ == "__main__":
    solve()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // Read from stdin, write to stdout.
    return 0;
}
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // Read from stdin, write to stdout.
    }
}
`,
};

export interface StarterCode {
  language?: string;
  template?: string;
}

/**
 * Resolve the starter code to load for a language: the question's own template when present,
 * otherwise the sensible default skeleton. Never returns empty for a supported language.
 */
export function resolveStarter(
  starterCodes: StarterCode[] | undefined,
  language: SupportedLanguage
): string {
  const match = (starterCodes || []).find(
    (sc) => sc.language?.toLowerCase() === language.toLowerCase()
  );
  if (match?.template && match.template.trim()) return match.template;
  return STARTER_TEMPLATES[language] ?? '';
}

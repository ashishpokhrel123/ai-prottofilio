/**
 * Syntax theme for fenced code blocks.
 *
 * Hand-written rather than imported from `react-syntax-highlighter`'s bundled
 * themes. Every one of those (vscDarkPlus included, which this replaces) is
 * built for a blue-black editor chrome and drags in six saturated hues — which
 * would put more colour in one code block than the entire rest of the
 * interface uses, and break the one-accent rule the design depends on.
 *
 * This keeps code near-monochrome and spends the accent on exactly one token
 * class: strings and numbers, the literal values. Structure comes from weight
 * and dimming, the same way it does everywhere else on the page. Colours are
 * keyed to the theme variables so a code block reads correctly in light and
 * dark mode alike.
 */
export const CODE_THEME: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: "var(--zinc-100)",
    background: "none",
    fontFamily: "var(--font-mono)",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    lineHeight: "1.6",
    tabSize: 2,
    hyphens: "none",
  },
  'pre[class*="language-"]': {
    color: "var(--zinc-100)",
    background: "var(--panel-sunken)",
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    overflow: "auto",
    margin: 0,
  },

  // Dimmed to the point of near-invisibility. Comments are context for whoever
  // is editing the file, not for someone skimming a portfolio answer.
  comment: { color: "var(--zinc-700)", fontStyle: "italic" },
  prolog: { color: "var(--zinc-700)" },
  doctype: { color: "var(--zinc-700)" },
  cdata: { color: "var(--zinc-700)" },

  punctuation: { color: "var(--zinc-500)" },
  operator: { color: "var(--zinc-400)" },

  // The accent, spent once: literal values, in the brand purple.
  string: { color: "var(--gemini-500)" },
  char: { color: "var(--gemini-500)" },
  number: { color: "var(--gemini-500)" },
  boolean: { color: "var(--gemini-500)" },
  "attr-value": { color: "var(--gemini-500)" },
  regex: { color: "var(--gemini-500)" },

  // Everything structural is monochrome; weight carries the hierarchy.
  keyword: { color: "var(--zinc-50)", fontWeight: "500" },
  "control-flow": { color: "var(--zinc-50)", fontWeight: "500" },
  atrule: { color: "var(--zinc-50)", fontWeight: "500" },
  important: { color: "var(--zinc-50)", fontWeight: "600" },

  function: { color: "var(--zinc-100)" },
  "class-name": { color: "var(--zinc-100)" },
  "function-variable": { color: "var(--zinc-100)" },
  tag: { color: "var(--zinc-100)" },
  selector: { color: "var(--zinc-100)" },

  property: { color: "var(--zinc-400)" },
  "attr-name": { color: "var(--zinc-400)" },
  constant: { color: "var(--zinc-400)" },
  symbol: { color: "var(--zinc-400)" },
  variable: { color: "var(--zinc-100)" },
  builtin: { color: "var(--zinc-100)" },
  entity: { color: "var(--zinc-100)" },
  url: { color: "var(--zinc-100)" },

  deleted: { color: "var(--status-error)" },
  inserted: { color: "var(--gemini-500)" },

  bold: { fontWeight: "600" },
  italic: { fontStyle: "italic" },
  namespace: { opacity: 0.6 },
};

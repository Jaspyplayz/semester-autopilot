// Canvas stores syllabus pages as HTML. This turns one into the kind of plain
// text the parser reads, and finds the Canvas files it links to. The output is
// only ever parsed or shown as text, never rendered as HTML. It walks the string
// once rather than using backtracking regexes, because the HTML comes from
// whichever site the student named.

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "center", "dd", "div", "dl", "dt", "figure", "footer", "form",
  "header", "hr", "main", "nav", "ol", "p", "pre", "section", "table", "ul",
]);
const SKIPPED_TAGS = new Set(["script", "style", "noscript", "template", "iframe"]);
const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d{1,7}|#x[\da-f]{1,6}|[a-z]{2,8});/gi, (whole, body: string) => {
    if (!body.startsWith("#")) return ENTITIES[body] ?? ENTITIES[body.toLowerCase()] ?? whole;
    const code = /^#x/i.test(body) ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code).replace(/\u00a0/, " ") : whole;
  });
}

interface Handlers {
  text(value: string): void;
  tag(name: string, closing: boolean, raw: string): void;
}

function walk(html: string, on: Handlers): void {
  const lower = html.toLowerCase();
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf("<", i);
    if (open < 0) {
      on.text(html.slice(i));
      return;
    }
    if (open > i) on.text(html.slice(i, open));
    if (html.startsWith("<!--", open)) {
      const end = html.indexOf("-->", open + 4);
      if (end < 0) return;
      i = end + 3;
      continue;
    }
    const m = /^<(\/?)([a-z][a-z0-9]*)/i.exec(html.slice(open, open + 40));
    if (!m) {
      // A declaration, or a stray "<" in text.
      if (html[open + 1] === "!" || html[open + 1] === "?") {
        const end = html.indexOf(">", open);
        if (end < 0) return;
        i = end + 1;
      } else {
        on.text("<");
        i = open + 1;
      }
      continue;
    }
    let end = open + m[0].length;
    let quote = "";
    for (; end < html.length; end++) {
      const c = html[end];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ">") {
        break;
      }
    }
    if (end >= html.length) return;
    const name = m[2].toLowerCase();
    i = end + 1;
    if (SKIPPED_TAGS.has(name) && !m[1]) {
      const close = lower.indexOf(`</${name}`, i);
      if (close < 0) return;
      const closeEnd = html.indexOf(">", close);
      if (closeEnd < 0) return;
      i = closeEnd + 1;
      continue;
    }
    on.tag(name, Boolean(m[1]), html.slice(open, end + 1));
  }
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export function htmlToText(html: string): string {
  const out: string[] = [];
  let cells: string[] | null = null;
  let cell: string[] | null = null;

  const endCell = () => {
    if (cell && cells) cells.push(squash(cell.join("")).replace(/\|/g, "/"));
    cell = null;
  };
  const endRow = () => {
    endCell();
    if (cells?.length) out.push(`\n| ${cells.join(" | ")} |`);
    cells = null;
  };

  walk(html, {
    text(value) {
      (cell ?? out).push(decodeEntities(value).replace(/\s+/g, " "));
    },
    tag(name, closing) {
      if (name === "tr") {
        endRow();
        if (!closing) cells = [];
      } else if (name === "td" || name === "th") {
        endCell();
        if (!closing) {
          cells ??= [];
          cell = [];
        }
      } else if (cell) {
        // Anything else inside a cell just separates words.
        if (name === "br" || name === "p" || name === "div" || name === "li") cell.push(" ");
      } else if (name === "br") {
        out.push("\n");
      } else if (/^h[1-6]$/.test(name)) {
        out.push(closing ? "\n\n" : `\n\n${"#".repeat(Number(name[1]))} `);
      } else if (name === "li") {
        if (!closing) out.push("\n- ");
      } else if (BLOCK_TAGS.has(name)) {
        if (name === "table") endRow();
        out.push("\n\n");
      }
    },
  });
  endRow();

  return out
    .join("")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface LinkedFile {
  id: string;
  label: string;
}

const FILE_LINK_RE = /\/files\/(\d+)/;

/** Canvas files an HTML page links to, in order, once each, with their link text. */
export function linkedFiles(html: string): LinkedFile[] {
  const found = new Map<string, string>();
  let current: { id: string; label: string[] } | null = null;

  const finish = () => {
    if (current && !found.has(current.id)) found.set(current.id, squash(current.label.join("")));
    current = null;
  };

  walk(html, {
    text(value) {
      current?.label.push(decodeEntities(value));
    },
    tag(name, closing, raw) {
      if (name !== "a") return;
      finish();
      if (closing) return;
      const attrs = [...raw.matchAll(/\b(?:href|data-api-endpoint)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)];
      const id = attrs.map((a) => FILE_LINK_RE.exec(a[1] ?? a[2] ?? a[3] ?? "")?.[1]).find(Boolean);
      if (id) current = { id, label: [] };
    },
  });
  finish();
  return [...found].map(([id, label]) => ({ id, label }));
}

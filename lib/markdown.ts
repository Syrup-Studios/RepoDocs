import MarkdownIt from "markdown-it";

export type Heading = { id: string; text: string; level: number };

type Highlight = (code: string, language: string) => string;

export function createMarkdown(highlight?: Highlight, allowHtml = false): InstanceType<typeof MarkdownIt> {
  return new MarkdownIt({
    html: allowHtml,
    linkify: true,
    typographer: true,
    ...(highlight ? { highlight } : {}),
  });
}

export function slugifyHeading(value: string, used: Map<string, number>): string {
  const base = value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&\w+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-") || "section";
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}

export function prepareMarkdown(source: string): string {
  const lines = source
    .replace(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*\r?\n?/, "")
    .replace(/<\/?u>/gi, "")
    .replace(/:material-[\w-]+:\{[^}]*\}/g, "")
    .replace(/:material-[\w-]+:/g, "")
    .replace(/\{(?:[.#][\w-]+\s*)+\}/g, "")
    .replace(/^- \[x\]/gim, "- ☑")
    .replace(/^- \[ \]/gm, "- ☐")
    .replaceAll("\r\n", "\n")
    .split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(?:!!!|\?\?\?\+?)\s+([\w-]+)(?:\s+"(.+)")?\s*$/i);
    if (!match) {
      output.push(lines[index]);
      continue;
    }

    const title = match[2] ?? navigationLabel(match[1]);
    const body: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line.startsWith("    ")) {
        body.push(line.slice(4));
        cursor += 1;
        continue;
      }
      if (line.trim() === "" && (body.length === 0 || lines[cursor + 1]?.startsWith("    "))) {
        body.push("");
        cursor += 1;
        continue;
      }
      break;
    }
    output.push(`> ##### ${title}`);
    for (const line of body) output.push(line ? `> ${line}` : ">");
    output.push("");
    index = cursor - 1;
  }
  return output.join("\n");
}

export function renderMarkdown(source: string): { html: string; headings: Heading[] } {
  const markdown = createMarkdown();
  const headings: Heading[] = [];
  const usedHeadings = new Map<string, number>();
  markdown.renderer.rules.heading_open = (tokens, index, options, env, renderer) => {
    const text = tokens[index + 1]?.content ?? "Section";
    const id = slugifyHeading(text, usedHeadings);
    tokens[index].attrSet("id", id);
    const level = Number(tokens[index].tag.slice(1));
    if (level === 2 || level === 3) headings.push({ id, text, level });
    return renderer.renderToken(tokens, index, options);
  };

  return {
    html: markdown.render(prepareMarkdown(source)),
    headings,
  };
}

function navigationLabel(name: string): string {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

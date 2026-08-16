import type { RepositoryFooterLink } from "@/lib/types";

export function parseFooterLinks(value: unknown, location: string): RepositoryFooterLink[] {
  if (!Array.isArray(value)) {
    throw new Error(`${location} must be a list.`);
  }

  const links: RepositoryFooterLink[] = [];
  const labels = new Set<string>();
  for (const [index, item] of value.entries()) {
    const itemLocation = `${location}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${itemLocation} must contain a label and URL.`);
    }

    const link = item as Record<string, unknown>;
    if (typeof link.label !== "string" || !link.label.trim()) {
      throw new Error(`${itemLocation} must define a non-empty label.`);
    }
    if (typeof link.url !== "string" || !link.url.trim()) {
      throw new Error(`${itemLocation} must define a non-empty URL.`);
    }

    let url: URL;
    try {
      url = new URL(link.url.trim());
    } catch (error) {
      throw new Error(`${itemLocation} must define a valid web URL.`, { cause: error });
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      throw new Error(`${itemLocation} must define an HTTP or HTTPS URL without credentials.`);
    }

    const label = link.label.trim();
    const normalizedLabel = label.toLowerCase();
    if (labels.has(normalizedLabel)) {
      throw new Error(`${location} contains the duplicate label "${label}".`);
    }
    labels.add(normalizedLabel);
    links.push({ label, url: url.href });
  }

  return links;
}

import { describe, expect, test } from "bun:test";
import { documentationIndex } from "@/lib/project-index";
import type { CachedProject, GeneratedDocumentation } from "@/lib/types";

describe("documentationIndex", () => {
  test("keeps page navigation data and removes rendered page content", () => {
    const project = {
      slug: "sample",
      name: "Sample",
      defaultVersion: "latest",
      defaultLocale: "en",
      versions: {
        latest: {
          id: "latest",
          label: "Latest",
          branch: "main",
          sourceRevision: "abc123",
          builtAt: "2026-10-24T00:00:00.000Z",
          locales: {
            en: {
              code: "en",
              label: "English",
              defaultPage: "",
              navigation: [{ type: "page", title: "Home", path: "" }],
              pages: {
                "": {
                  path: "",
                  sourcePath: "docs/index.md",
                  title: "Home",
                  description: "Sample docs",
                  html: "<p>large rendered page</p>",
                  headings: [],
                  history: { createdAt: "", updatedAt: "", updatedRevision: "", authors: [] },
                },
              },
            },
          },
        },
      },
    } as unknown as CachedProject;
    const result = documentationIndex({
      generatedAt: "2026-10-24T00:00:00.000Z",
      siteDocumentation: project,
      projects: [project],
    } as GeneratedDocumentation);

    expect(result.projects[0].versions.latest.locales.en.navigation).toEqual(project.versions.latest.locales.en.navigation);
    expect(result.projects[0].versions.latest.locales.en.pages[""].title).toBe("Home");
    expect("html" in result.projects[0].versions.latest.locales.en.pages[""]).toBe(false);
    expect(result.siteDocumentation).toBe(project);
  });
});

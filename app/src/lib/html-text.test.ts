import { describe, expect, it } from "vitest";
import { htmlToText, linkedFiles } from "./html-text";
import { parseSyllabus } from "./parse";

describe("htmlToText", () => {
  it("keeps headings, paragraphs, line breaks and list items on their own lines", () => {
    const text = htmlToText("<h2>Marking</h2><p>Read this.<br>Then that.</p><ul><li>One</li><li>Two</li></ul>");
    expect(text).toBe("## Marking\n\nRead this.\nThen that.\n\n- One\n- Two");
  });

  it("drops scripts, styles and comments", () => {
    expect(htmlToText("<style>p{}</style><p>Kept</p><script>alert(1)</script><!-- gone -->")).toBe("Kept");
  });

  it("decodes entities once, so escaped markup stays text", () => {
    expect(htmlToText("<p>A&nbsp;&amp;&nbsp;B &#8211; &#x41; &ndash; &amp;lt;b&amp;gt; &bogus;</p>")).toBe(
      "A & B – A – &lt;b&gt; &bogus;",
    );
  });

  it("turns tables into markdown rows", () => {
    const html = "<table><tr><th>Item</th><th>Weight</th></tr><tr><td>Test\n 1</td><td>25%</td></tr></table>";
    expect(htmlToText(html)).toBe("| Item | Weight |\n| Test 1 | 25% |");
  });

  it("escapes pipes in cells so they can't add columns", () => {
    expect(htmlToText("<table><tr><td>a|b</td><td>c</td></tr></table>")).toBe("| a/b | c |");
  });

  it("gives text the parser can read as a marking scheme", () => {
    const html = `<h2>Marking scheme</h2>
      <table><thead><tr><th>Assessment</th><th>Weight</th><th>Due</th></tr></thead>
      <tbody><tr><td>Midterm</td><td>25%</td><td>Fri Oct 16, 2026, 7:00 pm</td></tr></tbody></table>`;
    const { rows } = parseSyllabus(htmlToText(html), { term: "Fall 2026", course: { code: "CSC 207H1", name: "" } });
    expect(rows).toMatchObject([{ course: "CSC 207H1", what: "Midterm, room TBA", worth: "25%" }]);
    expect(rows[0].when).toContain("Oct 16");
  });
});

describe("linkedFiles", () => {
  it("finds Canvas file links with their link text, once each", () => {
    const html = `<a class="instructure_file_link" href="https://q.utoronto.ca/courses/12/files/345?wrap=1"
        data-api-endpoint="https://q.utoronto.ca/api/v1/courses/12/files/345">Course <b>Outline</b></a>
      <a href="/courses/12/files/345/download">again</a>
      <a href="/files/678/download?download_frd=1">Slides</a>
      <a href="https://example.com/page">not a file</a>`;
    expect(linkedFiles(html)).toEqual([
      { id: "345", label: "Course Outline" },
      { id: "678", label: "Slides" },
    ]);
  });
});

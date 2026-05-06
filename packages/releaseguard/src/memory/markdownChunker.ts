import { createHash } from "node:crypto";
import path from "node:path";
import { normalizePath } from "../graph/capabilityGraph";
import {
  REPO_MEMORY_INDEX_VERSION,
  RepoMemoryChunk,
  RepoMemorySourceType,
} from "./types";

type Heading = {
  level: number;
  title: string;
};

type Section = {
  headingPath: string[];
  title: string;
  text: string;
};

export function chunkMarkdownFile(args: {
  filePath: string;
  sourceType: RepoMemorySourceType;
  markdown: string;
}): RepoMemoryChunk[] {
  const sections = splitMarkdownByHeading(args.markdown, args.filePath);
  return sections
    .filter((section) => section.text.trim().length > 0)
    .map((section, index) => ({
      chunk_id: memoryChunkId({
        filePath: args.filePath,
        headingPath: section.headingPath,
        index,
      }),
      source_type: args.sourceType,
      title: section.title,
      text: section.text.trim(),
      file_path: normalizePath(args.filePath),
      heading_path: section.headingPath,
      related_capability_ids: [],
      related_file_paths: [],
      tagging_status: "untagged",
      index_version: REPO_MEMORY_INDEX_VERSION,
    }));
}

export function splitMarkdownByHeading(
  markdown: string,
  filePath: string,
): Section[] {
  const lines = markdown.split(/\r?\n/);
  const fallbackTitle = titleFromFilePath(filePath);
  const sections: Section[] = [];
  const headingStack: Heading[] = [];
  let currentTitle = fallbackTitle;
  let currentHeadingPath: string[] = [];
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text.length === 0) {
      currentLines = [];
      return;
    }
    sections.push({
      headingPath: currentHeadingPath,
      title: currentTitle,
      text,
    });
    currentLines = [];
  };

  for (const line of lines) {
    const heading = parseHeading(line);
    if (!heading) {
      currentLines.push(line);
      continue;
    }

    flush();
    while (
      headingStack.length > 0 &&
      headingStack[headingStack.length - 1].level >= heading.level
    ) {
      headingStack.pop();
    }
    headingStack.push(heading);
    currentHeadingPath = headingStack.map((item) => item.title);
    currentTitle = heading.title;
    currentLines.push(line);
  }

  flush();

  if (sections.length === 0 && markdown.trim().length > 0) {
    return [
      {
        headingPath: [],
        title: fallbackTitle,
        text: markdown.trim(),
      },
    ];
  }

  return sections;
}

function parseHeading(line: string): Heading | undefined {
  const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
  if (!match) {
    return undefined;
  }
  return {
    level: match[1].length,
    title: match[2].replace(/\s+#+$/, "").trim(),
  };
}

function titleFromFilePath(filePath: string): string {
  return path.basename(filePath).replace(/\.md$/i, "");
}

function memoryChunkId(args: {
  filePath: string;
  headingPath: string[];
  index: number;
}): string {
  const hash = createHash("sha1")
    .update(normalizePath(args.filePath))
    .update("\n")
    .update(args.headingPath.join(" > "))
    .update("\n")
    .update(String(args.index))
    .digest("hex")
    .slice(0, 16);
  return `mem_${hash}`;
}

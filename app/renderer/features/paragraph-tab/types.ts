export interface Template {
  id: string;
  name: string;          // mirrors profileName; kept for backward-compat
  profileImage: string;
  profileName: string;
  postDate?: string;
  readMoreText: string;
  commentLink?: string;  // deprecated; ignored by canvas
  /** Reel Stories (paragraph): if set, MP4s write here (no /converted). Overrides Settings → Output for that run. */
  outputDir?: string;
  createdAt: string;
}

export interface CountRanges {
  likeMin: number;
  likeMax: number;
  commentMin: number;
  commentMax: number;
  shareMin: number;
  shareMax: number;
}

export const DEFAULT_COUNT_RANGES: CountRanges = {
  likeMin: 1000,  likeMax: 99000,
  commentMin: 100, commentMax: 20000,
  shareMin: 50,   shareMax: 10000,
};

export interface LayoutTemplate {
  id: string;
  name: string;
  html: string;
  countRanges?: CountRanges;
  createdAt: string;
}

export interface WritingStyle {
  id: string;
  name: string;
  prompt: string;    // uses {count} and {wordCount} tokens
  wordCount: number;
  createdAt: string;
}

export interface ParagraphQueueItem {
  id: string;
  text: string;
  lineNumber: number;
}

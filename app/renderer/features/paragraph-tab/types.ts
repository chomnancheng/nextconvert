export interface Template {
  id: string;
  name: string;
  profileImage: string;
  profileName: string;
  postDate?: string;   // kept for backward-compat; canvas always shows today's date
  readMoreText: string;
  commentLink: string;
  createdAt: string;
}

export interface ParagraphQueueItem {
  id: string;
  text: string;
  lineNumber: number;
}

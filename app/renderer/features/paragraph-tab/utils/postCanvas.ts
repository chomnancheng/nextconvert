import type { Template } from "../types";

interface Dims {
  width: number;
  height: number;
}

export interface PostRenderOptions {
  dims?: Dims;
  /** Skip background fill so video-bg shows through when composited */
  transparent?: boolean;
}

// ── Icon SVG paths (Material Design, viewBox 0 0 24 24) ───────────────────
const PATH_THUMB_UP =
  "M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z";
const PATH_COMMENT =
  "M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z";
const PATH_SHARE =
  "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z";

// ── Styled text types ─────────────────────────────────────────────────────

interface TextSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  color: string | null;
}

interface Token {
  word: string;
  bold: boolean;
  italic: boolean;
  color: string | null;
  isBreak: boolean;
}

// ── HTML parsing ──────────────────────────────────────────────────────────

function parseHtml(html: string): TextSpan[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const spans: TextSpan[] = [];

  function walk(node: Node, style: { bold: boolean; italic: boolean; color: string | null }) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || "";
      if (t) spans.push({ text: t, ...style });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      spans.push({ text: "\n", bold: false, italic: false, color: null });
      return;
    }
    const s = { ...style };
    if (["B", "STRONG"].includes(el.tagName) || el.style.fontWeight === "bold" || el.style.fontWeight === "700") s.bold = true;
    if (["I", "EM"].includes(el.tagName) || el.style.fontStyle === "italic") s.italic = true;
    if (el.style.color) s.color = el.style.color;
    for (const child of el.childNodes) walk(child, s);
  }

  for (const child of doc.body.childNodes) walk(child, { bold: false, italic: false, color: null });
  return spans;
}

function spansToTokens(spans: TextSpan[]): Token[] {
  const tokens: Token[] = [];
  for (const span of spans) {
    const parts = span.text.split("\n");
    for (let pi = 0; pi < parts.length; pi++) {
      if (pi > 0) tokens.push({ word: "", bold: false, italic: false, color: null, isBreak: true });
      const words = parts[pi].split(/\s+/).filter(Boolean);
      for (const w of words) {
        tokens.push({ word: w, bold: span.bold, italic: span.italic, color: span.color, isBreak: false });
      }
    }
  }
  return tokens;
}

// ── Canvas helpers ────────────────────────────────────────────────────────

async function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fontStr(bold: boolean, italic: boolean, size: number, family: string): string {
  return `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${family}`;
}

function measureStyledLineCount(
  ctx: CanvasRenderingContext2D,
  tokens: Token[],
  maxWidth: number,
  size: number,
  family: string,
): number {
  let lines = 1;
  let lineW = 0;
  ctx.font = fontStr(false, false, size, family);
  const spW = ctx.measureText(" ").width;

  for (const tok of tokens) {
    if (tok.isBreak) { lines++; lineW = 0; continue; }
    ctx.font = fontStr(tok.bold, tok.italic, size, family);
    const w = ctx.measureText(tok.word).width;
    if (lineW > 0 && lineW + spW + w > maxWidth) { lines++; lineW = w; }
    else lineW += lineW > 0 ? spW + w : w;
  }
  return lines;
}

function drawStyledText(
  ctx: CanvasRenderingContext2D,
  tokens: Token[],
  x: number,
  startY: number,
  maxWidth: number,
  lineH: number,
  size: number,
  family: string,
  defaultColor: string,
): number {
  ctx.font = fontStr(false, false, size, family);
  const spW = ctx.measureText(" ").width;

  // Build line groups
  const lines: Token[][] = [[]];
  let lineW = 0;
  for (const tok of tokens) {
    if (tok.isBreak) { lines.push([]); lineW = 0; continue; }
    ctx.font = fontStr(tok.bold, tok.italic, size, family);
    const w = ctx.measureText(tok.word).width;
    if (lineW > 0 && lineW + spW + w > maxWidth) {
      lines.push([tok]); lineW = w;
    } else {
      lines[lines.length - 1].push(tok);
      lineW += lineW > 0 ? spW + w : w;
    }
  }

  // Draw
  let curY = startY;
  for (const line of lines) {
    if (line.length === 0) { curY += lineH; continue; }
    let curX = x;
    for (let i = 0; i < line.length; i++) {
      const tok = line[i];
      if (i > 0) curX += spW;
      ctx.font = fontStr(tok.bold, tok.italic, size, family);
      const w = ctx.measureText(tok.word).width;
      ctx.fillStyle = tok.color ?? defaultColor;
      ctx.fillText(tok.word, curX, curY);
      curX += w;
    }
    curY += lineH;
  }
  return curY;
}

/** Draw profile image with cover-crop (CSS object-fit: cover equivalent) */
function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const imgAspect = iw / ih;
  const dstAspect = dw / dh;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (imgAspect > dstAspect) {
    sw = ih * dstAspect;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / dstAspect;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function todayDateStr(): string {
  const now = new Date();
  const h = now.getHours() % 12 || 12;
  const m = now.getMinutes().toString().padStart(2, "0");
  return `Today at ${h}:${m} ${now.getHours() >= 12 ? "PM" : "AM"}`;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.round(n / 1000)}K`;
}

function drawSvgIcon(
  ctx: CanvasRenderingContext2D,
  svgPath: string,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(svgPath));
  ctx.restore();
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function renderPostToDataUrl(
  template: Template,
  postText: string,
  options: PostRenderOptions = {},
): Promise<string> {
  const dims = options.dims ?? { width: 1080, height: 1920 };
  const transparent = options.transparent ?? false;

  const { width, height } = dims;
  const S = width / 1080;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Parse HTML into styled tokens for rendering
  const tokens = spansToTokens(parseHtml(postText));

  // Background — omit in transparent / video-bg mode
  if (!transparent) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "#E9EBEE");
    grad.addColorStop(1, "#D8DADF");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // Load profile image
  let profileImg: HTMLImageElement | null = null;
  if (template.profileImage) {
    try {
      const dataUrl = await window.electronAPI.imageToDataUrl(template.profileImage);
      profileImg = await loadImg(dataUrl);
    } catch { /* fallback avatar */ }
  }

  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  // ── Sizes ─────────────────────────────────────────────────────────────────
  const cardPad        = Math.round(36 * S);
  const cardX          = Math.round(36 * S);
  const cardW          = width - cardX * 2;
  const cardRadius     = Math.round(14 * S);
  const avatarR        = Math.round(64 * S);
  const avatarDia      = avatarR * 2;
  const nameFontSize   = Math.round(40 * S);
  const dateFontSize   = Math.round(30 * S);
  const textFontSize   = Math.round(52 * S);
  const textLineH      = Math.round(textFontSize * 1.6);
  const actionFontSize = Math.round(32 * S);
  const textMaxWidth   = cardW - cardPad * 2;

  // Random engagement counts — comments and shares always less than likes
  const likeCount    = Math.floor(Math.random() * 99000) + 1000;
  const commentCount = Math.max(50,  Math.floor(likeCount * (0.01 + Math.random() * 0.19)));
  const shareCount   = Math.max(10,  Math.floor(likeCount * (0.005 + Math.random() * 0.09)));
  const likeLabel    = formatCount(likeCount);
  const commentLabel = formatCount(commentCount);
  const shareLabel   = formatCount(shareCount);

  // Measure text height
  const textLineCount = measureStyledLineCount(ctx, tokens, textMaxWidth, textFontSize, font);
  const textBlockH = textLineCount * textLineH;

  // ── Card height ────────────────────────────────────────────────────────────
  const headerH   = avatarDia + cardPad * 2;
  const textSecH  = textBlockH + Math.round(24 * S);
  const readMoreH = template.readMoreText ? textFontSize + Math.round(20 * S) : 0;
  const reactionH = Math.round(48 * S);
  const sepH      = Math.round(1 * S) + Math.round(16 * S);
  const actionH   = Math.round(72 * S);
  const cardH     = headerH + textSecH + readMoreH + reactionH + sepH + actionH + cardPad;

  // Upper portion for reel, centered for square
  const topMargin = height > width
    ? Math.round((height - cardH) * 0.22)
    : Math.round((height - cardH) / 2);
  const cardY = Math.max(Math.round(40 * S), topMargin);

  // ── Shadow + card face (60% opaque so background shows through clearly) ────
  ctx.save();
  ctx.shadowColor   = "rgba(0,0,0,0.18)";
  ctx.shadowBlur    = Math.round(30 * S);
  ctx.shadowOffsetY = Math.round(8 * S);
  roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.fillStyle = "rgba(255,255,255,0.60)";
  ctx.fill();
  ctx.restore();

  roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.fillStyle = "rgba(255,255,255,0.60)";
  ctx.fill();

  let curY = cardY + cardPad;
  const innerX = cardX + cardPad;

  // ── Avatar ────────────────────────────────────────────────────────────────
  const avatarCx = innerX + avatarR;
  const avatarCy = curY + avatarR;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
  ctx.clip();
  if (profileImg) {
    drawCoverImage(ctx, profileImg, innerX, curY, avatarDia, avatarDia);
  } else {
    ctx.fillStyle = "#BEC3C9";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy - avatarR * 0.16, avatarR * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy + avatarR * 0.65, avatarR * 0.5, Math.PI, 0, false);
    ctx.fill();
  }
  ctx.restore();

  // ── Profile name ──────────────────────────────────────────────────────────
  const nameX = innerX + avatarDia + Math.round(18 * S);
  ctx.textBaseline = "top";
  ctx.font = `bold ${nameFontSize}px ${font}`;
  ctx.fillStyle = "#050505";
  ctx.fillText(template.profileName || "Profile Name", nameX, curY + Math.round(10 * S));

  // ── Date — always today, extra spacing below name ─────────────────────────
  ctx.font = `${dateFontSize}px ${font}`;
  ctx.fillStyle = "#65676B";
  ctx.fillText(todayDateStr(), nameX, curY + nameFontSize + Math.round(20 * S));

  curY += avatarDia + cardPad;

  // ── Post text (styled — honours colour/bold/italic from HTML) ─────────────
  ctx.textBaseline = "top";
  curY = drawStyledText(ctx, tokens, innerX, curY, textMaxWidth, textLineH, textFontSize, font, "#050505");
  curY += Math.round(16 * S);

  // ── Read more ─────────────────────────────────────────────────────────────
  if (template.readMoreText) {
    ctx.font = `${textFontSize}px ${font}`;
    ctx.fillStyle = "#1877F2";
    ctx.fillText(template.readMoreText, innerX, curY);
    curY += textFontSize + Math.round(20 * S);
  }

  curY += Math.round(8 * S);

  // ── Reactions row: 👍 ❤️  5.4K        1.2K Comments · 320 Shares ─────────
  const reactionY = curY + reactionH / 2;
  ctx.textBaseline = "middle";
  ctx.font      = `${Math.round(30 * S)}px ${font}`;
  ctx.fillStyle = "#65676B";
  ctx.fillText(`👍 ❤️  ${likeLabel}`, innerX, reactionY);
  ctx.textAlign = "right";
  ctx.fillText(`${commentLabel} Comments · ${shareLabel} Shares`, innerX + textMaxWidth, reactionY);
  ctx.textAlign = "left";
  curY += reactionH;

  // ── Separator ─────────────────────────────────────────────────────────────
  ctx.fillStyle = "#E4E6EB";
  ctx.fillRect(innerX, curY, textMaxWidth, Math.round(1 * S));
  curY += Math.round(1 * S) + Math.round(16 * S);

  // ── Action bar: Like | Comment | Share ───────────────────────────────────
  const actionY  = curY + actionH / 2;
  const iconSize = Math.round(30 * S);
  const iconGap  = Math.round(8 * S);
  const section  = textMaxWidth / 3;

  ctx.textBaseline = "middle";
  ctx.font         = `${actionFontSize}px ${font}`;

  // Like
  drawSvgIcon(ctx, PATH_THUMB_UP, innerX, actionY - iconSize / 2, iconSize, "#1877F2");
  ctx.fillStyle = "#65676B";
  ctx.fillText("Like", innerX + iconSize + iconGap, actionY);

  // Comment
  const commentBtnX = innerX + section;
  drawSvgIcon(ctx, PATH_COMMENT, commentBtnX, actionY - iconSize / 2, iconSize, "#65676B");
  ctx.fillStyle = "#65676B";
  ctx.fillText("Comment", commentBtnX + iconSize + iconGap, actionY);

  // Share (commentLink overrides label when set)
  const shareBtnX = innerX + section * 2;
  drawSvgIcon(ctx, PATH_SHARE, shareBtnX, actionY - iconSize / 2, iconSize, "#65676B");
  if (template.commentLink) {
    ctx.fillStyle = "#1877F2";
    const link = template.commentLink.length > 18
      ? `${template.commentLink.slice(0, 18)}…`
      : template.commentLink;
    ctx.fillText(link, shareBtnX + iconSize + iconGap, actionY);
  } else {
    ctx.fillStyle = "#65676B";
    ctx.fillText("Share", shareBtnX + iconSize + iconGap, actionY);
  }

  return canvas.toDataURL("image/png");
}

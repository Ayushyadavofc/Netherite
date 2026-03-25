export type TokenType = 'text' | 'wikilink';

export interface Token {
  type: TokenType;
  raw: string;
  content: string; // The filename/target inside [[...]]
  embed: boolean; // True if starts with !
}

/**
 * Tokenizes markdown text into text segments and wikilink segments.
 * Uses a robust manual scan instead of global regex to handle inlining correctly.
 */
export function tokenizeMarkdown(text: string): Token[] {
  const tokens: Token[] = [];
  let currentPos = 0;
  
  while (currentPos < text.length) {
    const nextStart = text.indexOf('[[', currentPos);
    
    if (nextStart === -1) {
      // No more wikilinks, add the rest as text
      tokens.push({ type: 'text', raw: text.slice(currentPos), content: '', embed: false });
      break;
    }
    
    // Check if it's an embed ![[
    const isEmbed = nextStart > 0 && text[nextStart - 1] === '!';
    const wikilinkStart = isEmbed ? nextStart - 1 : nextStart;
    
    // Add text before the wikilink
    if (wikilinkStart > currentPos) {
      tokens.push({ type: 'text', raw: text.slice(currentPos, wikilinkStart), content: '', embed: false });
    }
    
    // Find the end of the wikilink ]]
    const nextEnd = text.indexOf(']]', nextStart + 2);
    if (nextEnd === -1) {
      // Incomplete wikilink, treat the rest as text
      tokens.push({ type: 'text', raw: text.slice(wikilinkStart), content: '', embed: false });
      break;
    }
    
    const raw = text.slice(wikilinkStart, nextEnd + 2);
    const content = text.slice(nextStart + 2, nextEnd);
    
    tokens.push({ type: 'wikilink', raw, content, embed: isEmbed });
    currentPos = nextEnd + 2;
  }
  
  return tokens;
}

/**
 * Normalizes a wikilink target for resolution.
 * e.g. "Note Name.md" -> "Note Name" (for notes)
 */
export function normalizeTarget(target: string): string {
  return target.trim();
}

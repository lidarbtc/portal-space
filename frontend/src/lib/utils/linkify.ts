export interface TextSegment {
  type: 'text' | 'url';
  value: string;
}

// Matches http:// or https:// followed by non-whitespace characters
const URL_REGEX = /https?:\/\/[^\s<>]+/g;

// Characters that are unlikely to be part of a URL when at the end
const TRAILING_PUNCT = /[.,;:!?\]'")}>]+$/;

/**
 * Strip trailing punctuation from a URL match, with balanced parenthesis handling.
 * Returns [url, trailing] where trailing is the stripped suffix.
 */
function trimTrailing(raw: string): [string, string] {
  let url = raw;
  let trailing = '';

  // Iteratively strip trailing punctuation, respecting balanced parens
  while (url.length > 0) {
    const last = url[url.length - 1];

    // Handle closing paren: only strip if unbalanced
    if (last === ')') {
      const opens = (url.match(/\(/g) || []).length;
      const closes = (url.match(/\)/g) || []).length;
      if (closes > opens) {
        trailing = last + trailing;
        url = url.slice(0, -1);
        continue;
      }
      break;
    }

    // Strip other trailing punctuation
    if (/[.,;:!?\]'"}>]/.test(last)) {
      trailing = last + trailing;
      url = url.slice(0, -1);
      continue;
    }

    break;
  }

  return [url, trailing];
}

/**
 * Parse text into segments of plain text and URLs.
 * Only matches http:// and https:// schemes.
 */
export function parseTextWithUrls(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  // Reset regex state
  URL_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const rawUrl = match[0];
    const matchStart = match.index;

    // Must have a host after the scheme (reject bare "http://")
    const schemeEnd = rawUrl.indexOf('://') + 3;
    if (schemeEnd >= rawUrl.length) {
      continue;
    }

    const [url, trailing] = trimTrailing(rawUrl);

    // Add preceding text
    if (matchStart > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, matchStart) });
    }

    // Add URL segment
    segments.push({ type: 'url', value: url });

    // Adjust lastIndex: consume url + trailing (trailing becomes part of next text)
    lastIndex = matchStart + url.length;

    // Backtrack the regex to account for stripped trailing chars
    URL_REGEX.lastIndex = lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

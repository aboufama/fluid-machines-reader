// Separate the source's poems from study content without changing text-pages.json.
// Original block indices remain available for page anchors and search results.
const EDITORIAL = /^(?:Editorial|Transcription|Source annotations)\b/i;
const HAIKU = /\bhaiku\b/i;

// These title-only notes are followed by a distinct poem block. Page 458 is
// deliberately absent: its next note defines symmetric tensors, not a poem.
const NOTE_TITLE_BODIES = new Map([
  ['462:19', 20], ['463:28', 29], ['463:30', 31],
  ['464:21', 22], ['465:19', 20],
]);

function poemLines(text) {
  // A spaced slash marks transcribed line breaks. Keep internal slashes in
  // words (inertial/viscous) and in math expressions unchanged.
  return text.replace(/ +\/ +/g, '\n').trim();
}

function splitPoem(text) {
  // Detect a title-ending full stop before a colon inside an editorial notice.
  const sentence = text.match(/^(.*?\bHaiku)\.\s+([\s\S]+)$/i);
  if (sentence) return { title: sentence[1], text: poemLines(sentence[2]) };
  let splitAt = text.indexOf('\n');
  if (splitAt === -1) splitAt = text.indexOf(':');
  if (splitAt !== -1) {
    let title = text.slice(0, splitAt).trim()
      .replace(/^The page contains a /, '')
      .replace(/ (?:with portrait|beside a small portrait)$/, '');
    return { title, text: poemLines(text.slice(splitAt + 1)) };
  }
  return { title: text.trim(), text: '' };
}

/**
 * Partition one reviewed PDF page for a secondary haiku column.
 * @returns {{blocks: Array<{block: object, index: number}>,
 *            haikus: Array<{title: string, text: string, blockIndices: number[]}>}}
 */
export function splitPageHaikus(page) {
  const source = Array.isArray(page?.blocks) ? page.blocks : [];
  const consumed = new Set();
  const replacements = new Map();
  const haikus = [];
  const byIndex = new Map();
  const add = (title, text, indices) => {
    const poem = { title, text: poemLines(text), blockIndices: [...indices] };
    haikus.push(poem);
    for (const index of indices) { consumed.add(index); byIndex.set(index, poem); }
    return poem;
  };

  source.forEach((block, index) => {
    if (consumed.has(index)) return;
    const text = block.text || '';
    if (!HAIKU.test(text) || EDITORIAL.test(text)) return;
    // The back-cover paragraph describes the presence of poems; it is prose.
    if (!['heading', 'note'].includes(block.type)) return;

    // Two poems share one transcription note on this page.
    if (page.page === 165 && text.startsWith('The page also contains a Cat Haiku')) {
      const quotes = [...text.matchAll(/“([^”]+)”/g)].map(match => match[1]);
      if (quotes.length === 2) {
        add('Cat Haiku', quotes[0], [index]);
        add('Extra-Credit Haiku', quotes[1], [index]);
        return;
      }
    }

    const pairedIndex = block.type === 'heading'
      ? index + 1 : NOTE_TITLE_BODIES.get(`${page.page}:${index}`);
    if (pairedIndex !== undefined && source[pairedIndex]?.type === 'note') {
      add(text, source[pairedIndex].text || '', [index, pairedIndex]);
      return;
    }
    const poem = splitPoem(text);
    if (page.page === 458 && text === 'Matrix Representation Haiku') {
      poem.text = '[The poem is unreadable in the source.]';
    }
    add(poem.title, poem.text, [index]);
  });

  function attachNote(noteIndex, poemIndex, poemText, articleText = '') {
    const poem = byIndex.get(poemIndex);
    if (!poem || !source[noteIndex]) return;
    poem.text += `\n\n${poemText}`;
    if (!poem.blockIndices.includes(noteIndex)) poem.blockIndices.push(noteIndex);
    if (articleText) replacements.set(noteIndex, { ...source[noteIndex], text: articleText });
    else consumed.add(noteIndex);
  }

  // Notes solely about a poem travel with it. Scientific qualifications stay
  // in the article, including when they originally shared a transcription note.
  const standalone = {
    64: [20, 15], 88: [20, 9], 104: [15, 14], 318: [19, 13],
  }[page.page];
  if (standalone) {
    const [noteIndex, poemIndex] = standalone;
    attachNote(noteIndex, poemIndex, source[noteIndex]?.text || '');
  }
  if (page.page === 374) {
    const note = source[20]?.text || '';
    const boundary = note.indexOf(' Faded words');
    if (boundary !== -1) attachNote(20, 16, note.slice(0, boundary), `Transcription note:${note.slice(boundary)}`);
  }
  if (page.page === 552) {
    const note = source[15]?.text || '';
    const boundary = note.indexOf(' The displayed four-unknown');
    if (boundary !== -1) attachNote(15, 14, note.slice(0, boundary), `Transcription note:${note.slice(boundary)}`);
  }
  if (page.page === 554) {
    const note = source[11]?.text || '';
    const boundary = note.indexOf(' The haiku is unreadable');
    if (boundary !== -1) attachNote(11, 10, note.slice(boundary).trim(), note.slice(0, boundary));
  }

  return {
    blocks: source.flatMap((block, index) => consumed.has(index) ? [] : [{ block: replacements.get(index) || block, index }]),
    haikus,
  };
}

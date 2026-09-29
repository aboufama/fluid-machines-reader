import { renderBlock, appendRichText } from './math-render.js';
import { renderSourceImage } from './source-images.js';
import { externalAssets } from './image-policy.js';

const TYPES = [
  ['equations', 'Equations'],
  ['problems', 'Examples & practice'],
  ['figures', 'Figures']
];
const SYMBOL_NAMES = { 'α':'alpha', 'β':'beta', 'γ':'gamma', 'δ':'delta', 'ε':'epsilon', 'ζ':'zeta', 'η':'eta', 'θ':'theta', 'λ':'lambda', 'μ':'mu', 'ν':'nu', 'ξ':'xi', 'π':'pi', 'ρ':'rho', 'σ':'sigma', 'τ':'tau', 'φ':'phi', 'ϕ':'phi', 'ψ':'psi', 'ω':'omega', 'Γ':'gamma', 'Δ':'delta', 'Λ':'lambda', 'Σ':'sigma', 'Φ':'phi', 'Ψ':'psi', 'Ω':'omega', '∇':'nabla', '∂':'partial', '∞':'infty', '∫':'int', '∑':'sum', '√':'sqrt', '×':'times', '·':'cdot', '²':'2', '³':'3', '₀':'0', '₁':'1', '₂':'2', '₃':'3', '₄':'4', '₅':'5' };
const chapterKey = chapter => chapter ? (chapter.number || 'index') : 'front';
const chapterLabel = chapter => chapter ? `${chapter.number ? chapter.number + '. ' : ''}${chapter.title}` : 'Front matter';
const issueNote = block => block.type === 'note' && /^(Editorial|Transcription)\b/i.test(block.text || '');
const exerciseHeading = text => /^(?:\d+(?:\.\d+)*\.?\s*)?(?:example(?:\s+problem)?\b|practice\s+problems?\b|problems?(?:\s+with\s+answers)?\s*$)/i.test(text.trim());
const genericProblemHeading = text => /^(?:\d+(?:\.\d+)*\.?\s*)?(?:practice\s+)?problems?(?:\s+with\s+answers)?\s*$/i.test(text.trim());

export function normalizeStudySearch(value) {
  return String(value || '').replace(/[αβγδεζηθλμνξπρστφϕψωΓΔΛΣΦΨΩ∇∂∞∫∑√×·²³₀₁₂₃₄₅]/g, char => ` ${SYMBOL_NAMES[char]} `)
    .toLowerCase().replace(/\\(?:mathrm|mathbf|mathit|text|operatorname|left|right|displaystyle|quad|qquad)\b/g, ' ')
    .replace(/\\([a-z]+)/g, ' $1 ').replace(/[{}_^\\()[\],;:]/g, ' ').replace(/\s+/g, ' ').trim();
}

function richExcerpt(text, limit = 300) {
  if (text.length <= limit) return text;
  const chunks = text.match(/\\\([\s\S]*?\\\)|\S+\s*/g) || [];
  let output = '';
  for (const chunk of chunks) {
    if (output.length && output.length + chunk.length > limit) break;
    output += chunk;
  }
  return output.trimEnd() + '…';
}

// This indexes existing transcription blocks; it does not rewrite the book.
export function buildStudyIndex(pages, chapters, sourceImages = []) {
  const replacements = new Map(sourceImages.filter(image => image.position === 'replace').map(image => [`${image.page}:${image.blockIndex}`,image]));
  const entries = [];
  let currentChapter, heading = '';
  for (const page of pages) {
    const chapter = [...chapters].reverse().find(item => item.page <= page.page);
    if (chapter !== currentChapter) { currentChapter = chapter; heading = ''; }
    const blocks = page.blocks || [];
    const hasSourceNotes = page.review?.status === 'source_issue' || blocks.some(issueNote);
    let practiceSection = false;
    for (const [blockIndex, block] of blocks.entries()) {
      if (block.type === 'heading') {
        heading = block.text || '';
        if (genericProblemHeading(heading)) practiceSection = true;
        else if (!exerciseHeading(heading)) practiceSection = false;
      }
      let type, kind, title;
      if (block.type === 'math') {
        type = 'equations'; kind = 'Equation'; title = block.number ? `Equation (${block.number})` : 'Unnumbered equation';
      } else if (block.type === 'figure') {
        type = 'figures'; kind = 'Redrawn diagram';
        const caption = block.text || blocks[blockIndex + 1]?.type === 'caption' && blocks[blockIndex + 1].text || '';
        title = caption.match(/^Figure\s+[\w.]+/i)?.[0] || 'Diagram';
      } else if (block.type === 'heading' && exerciseHeading(block.text || '')) {
        // Consecutive generic headings lead to the same practice set.
        if (genericProblemHeading(block.text) && blocks.slice(Math.max(0, blockIndex - 2), blockIndex).some(previous => previous.type === 'heading' && genericProblemHeading(previous.text || ''))) continue;
        type = 'problems'; kind = /example/i.test(block.text) ? 'Example' : 'Practice set'; title = block.text;
      } else if (practiceSection && block.type === 'paragraph' && /^\d+[.)]\s+\(OBJECTIVE:/i.test(block.text || '')) {
        type = 'problems'; kind = 'Practice problem'; title = `Practice problem ${block.text.match(/^\d+/)[0]}`;
      } else continue;
      const before = blocks.slice(Math.max(0, blockIndex - 3), blockIndex).filter(item => item.type === 'paragraph');
      const after = blocks.slice(blockIndex + 1, blockIndex + 4).filter(item => item.type === 'paragraph' || item.type === 'caption');
      const context = type === 'problems' ? (block.type === 'paragraph' ? block.text : after[0]?.text || '') : type === 'figures' ? (block.text || after.find(item => item.type === 'caption')?.text || block.alt || '') : (before.at(-1)?.text || after[0]?.text || '');
      const searchable = [block.text, block.alt, block.number, heading, chapterLabel(chapter), ...before.map(item => item.text), ...after.map(item => item.text)].join(' ');
      entries.push({ type, kind, title, page:page.page, blockIndex, block, sourceImage:type === 'figures' ? replacements.get(`${page.page}:${blockIndex}`) : undefined, chapter:chapterKey(chapter), chapterLabel:chapterLabel(chapter), heading, context, hasSourceNotes, searchText:normalizeStudySearch(searchable) });
    }
  }
  for (const image of sourceImages.filter(image => image.placement === 'main' && image.position !== 'replace')) {
    const page = pages.find(page => page.page === image.page);
    const sourceBlock = page?.blocks[image.captionBlockIndex ?? image.blockIndex];
    const chapter = [...chapters].reverse().find(item => item.page <= image.page);
    const caption = sourceBlock?.type === 'caption' ? sourceBlock.text : image.alt || '';
    const title = image.figure ? `Figure ${image.figure}` : 'Source illustration';
    const block = {type:'caption',text:caption};
    entries.push({type:'figures',kind:externalAssets(image).length?'Source image':'Image unavailable',sourceImage:image,title,page:image.page,blockIndex:image.blockIndex,block,chapter:chapterKey(chapter),chapterLabel:chapterLabel(chapter),heading:'',context:caption,hasSourceNotes:page?.review?.status === 'source_issue',searchText:normalizeStudySearch([title,caption,image.alt,chapterLabel(chapter)].join(' '))});
  }
  entries.sort((a,b) => a.page-b.page || a.blockIndex-b.blockIndex);
  return entries;
}

export function filterStudyEntries(entries, { type = 'equations', chapter = 'all', query = '', notesOnly = false, numberedOnly = false } = {}) {
  const tokens = normalizeStudySearch(query).split(' ').filter(Boolean);
  const exactNumber = type === 'equations' ? String(query).trim().match(/^(?:eq(?:uation)?\.?\s*)?\(?([a-z0-9]+\.\d+[a-z]?)\)?$/i)?.[1].toLowerCase() : null;
  return entries.filter(entry => entry.type === type && (chapter === 'all' || entry.chapter === chapter) && (!notesOnly || entry.hasSourceNotes) && (!numberedOnly || type !== 'equations' || !!entry.block.number) && (exactNumber ? String(entry.block.number || '').toLowerCase() === exactNumber : tokens.every(token => entry.searchText.includes(token))));
}

const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const button = (className, text) => { const element = node('button', className, text); element.type = 'button'; return element; };
let browserCount = 0;

export function createStudyBrowser({ pages, chapters, sourceImages = [], onNavigate, onStateChange }) {
  const id = `study-browser-${++browserCount}`;
  const entries = buildStudyIndex(pages, chapters, sourceImages);
  const state = { type:'equations', chapter:'all', query:'', notesOnly:false, numberedOnly:false };
  let matched = [], shown = 0, inputTimer;
  const element = node('section', 'study-browser'); element.setAttribute('aria-label', 'Study browser');
  const modes = node('nav', 'study-modes'); modes.setAttribute('aria-label', 'Browse by');
  const modeButtons = TYPES.map(([type, title]) => {
    const control = button('study-mode', title);
    control.addEventListener('click', () => { state.type = type; refresh(); }); modes.append(control); return [type, control];
  });
  const filters = node('div', 'study-filters');
  const searchLabel = node('label', 'study-search'); searchLabel.append(node('span', 'study-filter-label', 'Search this index'));
  const search = node('input'); search.type = 'search'; search.autocomplete = 'off'; search.id = `${id}-search`; searchLabel.htmlFor = search.id;
  searchLabel.append(search);
  search.addEventListener('input', () => { state.query = search.value; clearTimeout(inputTimer); inputTimer = setTimeout(() => refresh(), 120); });
  search.addEventListener('keydown', event => { if (event.key === 'Enter') { clearTimeout(inputTimer); state.query = search.value; refresh(); } });
  const chapterFilter = node('div', 'study-chapter-filter'); chapterFilter.append(node('span', 'study-filter-label', 'Chapter'));
  const trigger = button('study-chapter-trigger', 'All chapters'); trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', `${id}-chapters`);
  const chapterMenu = node('div', 'study-chapter-menu'); chapterMenu.id = `${id}-chapters`; chapterMenu.setAttribute('role', 'listbox'); chapterMenu.setAttribute('aria-label', 'Chapter'); chapterMenu.hidden = true;
  const chapterOptions = [['all', 'All chapters'], ['front', 'Front matter'], ...chapters.map(chapter => [chapterKey(chapter), chapterLabel(chapter)])];
  const optionButtons = chapterOptions.map(([value, title]) => {
    const option = button('study-chapter-option', title); option.setAttribute('role', 'option'); option.tabIndex = -1; option.dataset.value = value;
    option.addEventListener('click', () => { state.chapter = value; closeMenu(); refresh(); }); chapterMenu.append(option); return option;
  });
  function closeMenu(returnFocus = true) {
    if (chapterMenu.hidden) return;
    chapterMenu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if (returnFocus) trigger.focus();
  }
  function openMenu(last = false) {
    chapterMenu.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    const selected = optionButtons.findIndex(option => option.dataset.value === state.chapter);
    optionButtons[last ? optionButtons.length - 1 : Math.max(0, selected)].focus();
  }
  trigger.addEventListener('click', () => chapterMenu.hidden ? openMenu() : closeMenu());
  trigger.addEventListener('keydown', event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(event.key === 'ArrowUp'); } });
  chapterMenu.addEventListener('keydown', event => {
    const current = optionButtons.indexOf(document.activeElement);
    let target;
    if (event.key === 'ArrowDown') target = (current + 1) % optionButtons.length;
    else if (event.key === 'ArrowUp') target = (current - 1 + optionButtons.length) % optionButtons.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = optionButtons.length - 1;
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); }
    else if (event.key === 'Tab') closeMenu(false);
    if (target !== undefined) { event.preventDefault(); optionButtons[target].focus(); }
  });
  document.addEventListener('pointerdown', event => { if (!chapterMenu.hidden && !chapterFilter.contains(event.target)) closeMenu(); });
  chapterFilter.append(trigger, chapterMenu); filters.append(searchLabel, chapterFilter);
  const switches = node('div', 'study-switches');
  function checkbox(text, key) {
    const label = node('label'); const input = node('input'); input.type = 'checkbox';
    input.addEventListener('change', () => { state[key] = input.checked; refresh(); }); label.append(input, document.createTextNode(text)); switches.append(label); return { label, input };
  }
  const numberedSwitch = checkbox('Numbered equations only', 'numberedOnly');
  const notesSwitch = checkbox('Pages with source notes', 'notesOnly');
  const resultBar = node('div', 'study-result-bar');
  const count = node('p', 'study-result-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  const reset = button('study-reset', 'Clear filters'); reset.addEventListener('click', () => { Object.assign(state, { chapter:'all', query:'', notesOnly:false, numberedOnly:false }); refresh(); search.focus(); });
  resultBar.append(count, reset);
  const results = node('div', 'study-results'); results.id = `${id}-results`;
  const more = button('study-more', 'Show 30 more'); more.addEventListener('click', () => {
    const firstNew = shown; appendResults(); results.children[firstNew]?.querySelector('a')?.focus({ preventScroll:true });
  });
  element.append(modes, filters, switches, resultBar, results, more);
  function contextLink(entry, text, className = '') {
    const link = node('a', className, text); link.href = `#page=${entry.page}&block=${entry.blockIndex}`;
    link.addEventListener('click', event => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); closeMenu(false); onNavigate(entry.page, entry.blockIndex);
    }); return link;
  }
  function appendResults() {
    const fragment = document.createDocumentFragment();
    for (const entry of matched.slice(shown, shown + 30)) {
      const card = node('article', `study-card study-card-${entry.type}`);
      const meta = node('div', 'study-card-meta'); meta.append(node('span', '', entry.chapterLabel), node('span', '', entry.page >= 13 && entry.page <= 591 ? `Book p. ${entry.page - 11} · PDF ${entry.page}` : `PDF ${entry.page}`));
      const title = node('h3', 'study-card-title'); title.append(contextLink(entry, entry.title));
      card.append(meta, title);
      if (entry.type === 'equations') {
        if (entry.heading && !/haiku/i.test(entry.heading)) { const heading = node('p', 'study-equation-heading'); appendRichText(heading, richExcerpt(entry.heading, 180)); card.append(heading); }
        card.append(renderBlock(entry.block));
      } else if (entry.type === 'figures') card.append(entry.sourceImage ? renderSourceImage(entry.sourceImage,entry.block.type === 'figure' ? {...entry.block,text:''} : undefined) : renderBlock({ ...entry.block, text:'' }));
      if (entry.context) { const excerpt = node('p', 'study-card-context'); appendRichText(excerpt, richExcerpt(entry.context)); card.append(excerpt); }
      const footer = node('div', 'study-card-footer'); footer.append(contextLink(entry, 'Read in context →'));
      if (entry.hasSourceNotes) footer.append(contextLink(entry, 'Page has source notes', 'study-source-note'));
      card.append(footer); fragment.append(card);
    }
    results.append(fragment); shown = Math.min(shown + 30, matched.length); more.hidden = shown >= matched.length;
    more.textContent = `Show ${Math.min(30, matched.length - shown)} more`;
  }
  function refresh(notify = true) {
    clearTimeout(inputTimer);
    search.value = state.query;
    search.placeholder = state.type === 'equations' ? 'Number, symbol, or topic — e.g. 5.1, ρ, Bernoulli' : state.type === 'problems' ? 'Topic or example number' : 'Figure number or topic';
    for (const [type, control] of modeButtons) control.setAttribute('aria-pressed', String(type === state.type));
    for (const option of optionButtons) option.setAttribute('aria-selected', String(option.dataset.value === state.chapter));
    trigger.textContent = (chapterOptions.find(([value]) => value === state.chapter)?.[1] || 'All chapters') + ' ▾';
    numberedSwitch.label.hidden = state.type !== 'equations'; numberedSwitch.input.checked = state.numberedOnly; notesSwitch.input.checked = state.notesOnly;
    matched = filterStudyEntries(entries, state); shown = 0; results.replaceChildren();
    const noun = state.type === 'equations' ? 'equation' : state.type === 'figures' ? 'figure' : 'example or practice entry';
    count.textContent = `${matched.length.toLocaleString()} ${noun}${matched.length === 1 ? '' : 's'}`;
    if (state.type === 'problems') count.textContent = `${matched.length.toLocaleString()} ${matched.length === 1 ? 'example or practice entry' : 'examples and practice entries'}`;
    reset.hidden = !(state.query || state.chapter !== 'all' || state.notesOnly || state.numberedOnly);
    if (!matched.length) results.append(node('p', 'study-empty', 'No matches. Try a different topic, symbol, or chapter.'));
    appendResults(); if (notify) onStateChange?.({ ...state });
  }
  refresh(false);
  return {
    element,
    open(options = {}) {
      clearTimeout(inputTimer); closeMenu(false);
      if (TYPES.some(([type]) => type === options.type)) state.type = options.type;
      if (options.chapter !== undefined) state.chapter = chapterOptions.some(([value]) => value === String(options.chapter)) ? String(options.chapter) : 'all';
      if (options.query !== undefined) state.query = String(options.query);
      if (options.notesOnly !== undefined) state.notesOnly = Boolean(options.notesOnly);
      if (options.numberedOnly !== undefined) state.numberedOnly = Boolean(options.numberedOnly);
      element.hidden = false; refresh(false);
    },
    close() { clearTimeout(inputTimer); closeMenu(false); element.hidden = true; }
  };
}

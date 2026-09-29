import { chapters } from './chapters.js';
import { renderBlock, appendRichText } from './math-render.js';
import { splitPageHaikus } from './haiku.js';
import { createStudyBrowser } from './study-browser.js';
import { createReadingNavigation } from './reading-navigation.js';
import { renderSourceImage } from './source-images.js';
import { applyImageRestorations } from './restoration-text.js';
import { externalAssets } from './image-policy.js';

const $ = id => document.getElementById(id);
const total = 596;
let pages = [], index = [], currentPage = 13, currentChapter = -2, fontSize = 16;
let matches = [], shown = 0, searchNavigation = false;
let studyBrowser, readingNavigation, sourceImages = new Map(), imageRecords = new Map();
let currentBlock = 0, routeMode = 'read', marginPage = 0, scrollAnchors = [], scrollFrame = 0;
const getChapter = n => [...chapters].reverse().find(c => c.page <= n);
const clamp = n => Math.max(1, Math.min(total, Math.trunc(Number(n)) || 1));
const sectionName = c => !c ? 'Front matter' : c.number ? `${/^\d/.test(c.number) ? 'Chapter' : 'Appendix'} ${c.number}` : 'Reference';
const pageLabel = n => n >= 13 && n <= 591 ? `Page ${n - 11}` : `PDF page ${n}`;

function buildNavigation() {
  readingNavigation = createReadingNavigation({ pages, chapters, onNavigate:(page,block) => { closeContents(); navigate(page,block); } });
  $('chapterNav').replaceChildren(readingNavigation.element);
  $('readingProgress').replaceChildren(readingNavigation.progressElement);
  $('sectionProgress').replaceChildren(readingNavigation.sectionControl);
  $('chapterNav').addEventListener('click', e => { if (e.target.closest('a')) closeContents(); });
}

function updateHeading() {
  const c = getChapter(currentPage), ci = chapters.indexOf(c);
  $('sectionLabel').textContent = sectionName(c);
  $('sectionTitle').textContent = c?.title || 'Front matter';
  $('printedPage').textContent = currentPage >= 13 && currentPage <= 591 ? `Book page ${currentPage - 11}` : '';
  if (document.activeElement !== $('pageInput')) $('pageInput').value = currentPage;
  $('previous').disabled = ci < 0; $('next').disabled = ci === chapters.length - 1;
  document.querySelectorAll('.chapter-link').forEach(a => {
    if (Number(a.dataset.page) === c?.page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${c?.title || 'Front matter'} — How Fluid Machines Work`;
  $('textTab').href = `#page=${currentPage}`;
  readingNavigation?.update(currentPage,currentBlock);
}

function makePage(page) {
  const section = document.createElement('section'); section.className = 'source-page'; section.id = `source-page-${page.page}`;
  const marker = document.createElement('h3'); marker.className = 'source-marker';
  const link = document.createElement('a'); link.href = `#page=${page.page}`; link.textContent = pageLabel(page.page);
  marker.append(link);
  if (page.page >= 13 && page.page <= 591) {
    const physical = document.createElement('span'); physical.textContent = `PDF ${page.page}`; marker.append(physical);
  }
  section.append(marker);
  const state = document.createElement('span'); state.className = 'review-state ' + (page.review?.status || 'unchecked');
  state.textContent = page.review?.status === 'verified' ? (page.review.diagrams_pending ? 'Text checked · diagram pending' : 'Visually checked') : page.review?.status === 'source_issue' ? 'Source issue documented' : page.review?.status === 'needs_astra' ? 'Further review needed' : 'OCR · unchecked';
  marker.append(state);
  const partition = splitPageHaikus(page);
  const noteCount = partition.blocks.filter(({block}) => block.type === 'note' && block.text).length + partition.haikus.length + (imageRecords.get(page.page)?.marginText || []).length;
  if (noteCount) {
    const showNotes = document.createElement('button'); showNotes.type = 'button'; showNotes.className = 'source-notes-link'; showNotes.textContent = `${noteCount} margin notes`;
    showNotes.addEventListener('click', () => { renderMargins(page.page); openMargins(); }); marker.append(showNotes);
  }
  const body = document.createElement('div'); body.className = 'page-body';
  const images = sourceImages.get(page.page) || [];
  const movedCaptions = new Set(images.filter(item => item.placement !== 'margin' && Number.isInteger(item.captionBlockIndex)).map(item => item.captionBlockIndex));
  const imageWithCaption = item => {
    const caption = Number.isInteger(item.captionBlockIndex) ? page.blocks[item.captionBlockIndex] : undefined;
    const element = renderSourceImage(item,caption);
    if (caption) { element.id = `source-block-${page.page}-${item.captionBlockIndex}`; element.dataset.page = page.page; element.dataset.block = item.captionBlockIndex; }
    return element;
  };
  for (const {block,index} of partition.blocks) {
    const inlineImages = images.filter(item => item.placement !== 'margin' && item.blockIndex === index);
    const beforeImages = inlineImages.filter(item => item.position === 'before');
    const inlineCaption = block.type === 'caption' && beforeImages.length > 0 && !movedCaptions.has(index);
    for (const [imageIndex,item] of beforeImages.entries()) {
      const element = inlineCaption ? renderSourceImage(item,imageIndex === beforeImages.length-1 ? block : undefined) : imageWithCaption(item);
      if (inlineCaption && imageIndex === 0) { element.id=`source-block-${page.page}-${index}`;element.dataset.page=page.page;element.dataset.block=index; }
      body.append(element);
    }
    const replacement = inlineImages.find(item => item.position === 'replace');
    if (block.type !== 'note' && !inlineCaption && !movedCaptions.has(index) && (block.text || ['figure','table'].includes(block.type))) {
      const element = replacement ? renderSourceImage(replacement,block) : renderBlock(block);
      element.id = `source-block-${page.page}-${index}`; element.dataset.page = page.page; element.dataset.block = index;
      body.append(element);
    }
    for (const item of inlineImages.filter(item => item.position === 'after')) body.append(imageWithCaption(item));
  }
  section.append(body);
  if (!page.blocks.length) {
    const empty = document.createElement('p'); empty.className = 'empty-page'; empty.textContent = page.review ? 'This page is blank.' : 'No text was recognized on this page.'; section.append(empty);
  }
  return section;
}

function renderMargins(n) {
  if (marginPage === n) return;
  marginPage = n;
  const page = pages[n-1], fragment = document.createDocumentFragment();
  if (!page) return;
  $('marginPage').textContent = `${pageLabel(n)} · PDF ${n}`;
  const {blocks,haikus} = splitPageHaikus(page);
  const notes = blocks.filter(({block}) => block.type === 'note' && block.text);
  const illustrations = (sourceImages.get(n) || []).filter(item => item.placement === 'margin' && externalAssets(item).length);
  const addImages = index => { for (const entry of illustrations.filter(item => item.blockIndex === index)) fragment.append(renderSourceImage(entry)); };
  for (const {block,index} of notes) { addImages(index); const note = renderBlock(block); note.id = `source-block-${n}-${index}`; fragment.append(note); }
  for (const haiku of haikus) {
    haiku.blockIndices.forEach(addImages);
    const poem = document.createElement('section'); poem.className = 'haiku';
    const title = document.createElement('h3'); appendRichText(title,haiku.title);
    const text = document.createElement('p'); appendRichText(text,haiku.text);
    poem.append(title,text); fragment.append(poem);
    for (const index of haiku.blockIndices) if (!notes.some(item => item.index === index)) { const anchor = document.createElement('span'); anchor.id = `source-block-${n}-${index}`; poem.prepend(anchor); }
  }
  const used = new Set([...notes.map(item => item.index),...haikus.flatMap(item => item.blockIndices)]);
  for (const entry of illustrations.filter(item => !used.has(item.blockIndex))) fragment.append(renderSourceImage(entry));
  for (const block of imageRecords.get(n)?.marginText || []) fragment.append(renderBlock(block));
  if (!fragment.childNodes.length) { const empty = document.createElement('p'); empty.className = 'margin-empty'; empty.textContent = 'No margin notes on this page.'; fragment.append(empty); }
  $('marginContent').replaceChildren(fragment); $('marginSidebar').scrollTop = 0;
}

function setMode(mode) {
  routeMode = mode;
  const reading = mode === 'read';
  for (const selector of ['.toolbar','.section-heading','.transcription-note','#sectionProgress']) document.querySelector(selector).hidden = !reading;
  $('chapterText').hidden = mode === 'study'; $('studyView').hidden = mode !== 'study';
  $('marginSidebar').hidden = !reading;
  document.querySelector('.layout').classList.toggle('is-index',!reading);
  $('textTab').classList.toggle('active-tab',reading);
  $('contentsTab').classList.toggle('active-tab',mode === 'contents');
  $('studyTab').classList.toggle('active-tab',mode === 'study');
  if (!reading) closeMargins();
}

function renderContents() {
  setMode('contents'); studyBrowser?.close(); scrollAnchors = [];
  currentChapter = -3;
  $('sectionLabel').textContent = '2022 edition'; $('sectionTitle').textContent = 'Contents'; $('printedPage').textContent = '';
  $('previous').disabled = true; $('next').disabled = false;
  document.querySelectorAll('.chapter-link').forEach(a => a.removeAttribute('aria-current'));
  const list = document.createElement('div'); list.className = 'contents-list';
  for (const c of chapters) {
    const link = document.createElement('a'); link.href = `#page=${c.page}`;
    const name = document.createElement('span'); name.textContent = `${c.number ? c.number + '. ' : ''}${c.title}`;
    const number = document.createElement('span'); number.textContent = `p. ${c.printedPage}`;
    link.append(name, number); list.append(link);
  }
  $('chapterText').replaceChildren(list); $('pageStatus').textContent = '11 chapters · 8 appendices · Index';
  document.title = 'Contents — How Fluid Machines Work';
}

function readRoute({ scroll = true } = {}) {
  if (!pages.length) return;
  if (location.hash === '#contents') {
    renderContents(); if (scroll) $('reader').scrollIntoView({ block: 'start' }); return;
  }
  const params = new URLSearchParams(location.hash.slice(1));
  if (['equations','problems','figures'].includes(params.get('browse'))) {
    setMode('study'); currentChapter = -4; scrollAnchors = [];
    const options = {type:params.get('browse')};
    for (const [key,param] of [['chapter','chapter'],['query','q']]) if (params.has(param)) options[key] = params.get(param);
    for (const key of ['notesOnly','numberedOnly']) if (params.has(key)) options[key] = params.get(key) === '1';
    studyBrowser.open(options);
    $('pageStatus').textContent = 'Study index'; document.title = 'Study index — How Fluid Machines Work';
    document.querySelectorAll('.study-shortcuts a').forEach(a => a.toggleAttribute('aria-current',a.hash.includes(options.type)));
    if (scroll) $('reader').scrollIntoView({block:'start'}); return;
  }
  if (!/^\d+$/.test(params.get('page') || '')) return;
  setMode('read'); studyBrowser?.close();
  document.querySelectorAll('.study-shortcuts a').forEach(a => a.removeAttribute('aria-current'));
  currentPage = clamp(params.get('page'));
  currentBlock = /^\d+$/.test(params.get('block') || '') ? Number(params.get('block')) : 0;
  const c = getChapter(currentPage), ci = chapters.indexOf(c);
  updateHeading();
  const first = c?.page || 1, end = chapters[ci + 1]?.page || total + 1;
  if (currentChapter !== ci) {
    const fragment = document.createDocumentFragment();
    for (const page of pages.slice(first - 1, end - 1)) fragment.append(makePage(page));
    $('chapterText').replaceChildren(fragment); currentChapter = ci;
    scrollAnchors = [...$('chapterText').querySelectorAll('.source-page')].flatMap(section => [{element:section,page:Number(section.id.slice(12)),block:0},...[...section.querySelectorAll('.page-body > h4')].map(element => ({element,page:Number(element.dataset.page),block:Number(element.dataset.block)}))]);
  }
  renderMargins(currentPage);
  $('pageStatus').textContent = `${c?.title || 'Front matter'} · PDF pages ${first}–${end - 1}`;
  if (scroll) {
    document.querySelectorAll('.jump-highlight').forEach(el => el.classList.remove('jump-highlight'));
    let target = params.has('block') ? $(`source-block-${currentPage}-${currentBlock}`) : null;
    if (target?.closest('#marginSidebar')) { $(`source-page-${currentPage}`)?.scrollIntoView({block:'start'}); openMargins(); target.scrollIntoView({block:'nearest'}); }
    else {
      if (target) target.classList.add('jump-highlight');
      target ||= currentPage === first ? $('reader') : $(`source-page-${currentPage}`);
      target?.scrollIntoView({ block: 'start' });
    }
  }
  saveReadingPosition();
}

function navigate(n,block) {
  const nextHash = `#page=${clamp(n)}${Number.isInteger(block) ? `&block=${block}` : ''}`;
  if (location.hash === nextHash) readRoute(); else location.hash = nextHash;
}

function saveReadingPosition() {
  try { localStorage.setItem('fluid-reader-page',String(currentPage)); localStorage.setItem('fluid-reader-block',String(currentBlock)); } catch {}
}

function trackReadingPosition() {
  scrollFrame = 0;
  if (routeMode !== 'read' || !scrollAnchors.length || $('sidebar').classList.contains('open') || $('marginSidebar').classList.contains('open')) return;
  const threshold = $('sectionProgress').getBoundingClientRect().bottom + 45;
  let low = 0, high = scrollAnchors.length-1, found = 0;
  while (low <= high) { const mid = (low+high)>>1; if (scrollAnchors[mid].element.getBoundingClientRect().top <= threshold) { found=mid; low=mid+1; } else high=mid-1; }
  const anchor = scrollAnchors[found];
  if (currentPage === anchor.page && currentBlock === anchor.block) return;
  currentPage=anchor.page; currentBlock=anchor.block; updateHeading(); renderMargins(currentPage); saveReadingPosition();
}

function closeContents() {
  $('sidebar').classList.remove('open'); $('sidebarShade').hidden = true; $('contentsToggle').setAttribute('aria-expanded', 'false');
  $('sidebar').inert = matchMedia('(max-width:760px)').matches;
  $('reader').inert = false; document.querySelector('.masthead').inert = false; document.querySelector('.skip').inert = false;
}
function closeMargins() {
  $('marginSidebar').classList.remove('open'); $('marginShade').hidden = true;
  $('marginToggle').setAttribute('aria-expanded','false');
  $('marginSidebar').inert = !matchMedia('(min-width:980px)').matches;
  $('marginSidebar').removeAttribute('role'); $('marginSidebar').removeAttribute('aria-modal');
  $('reader').inert = false; document.querySelector('.masthead').inert = false; document.querySelector('.skip').inert = false;
  $('sidebar').inert = matchMedia('(max-width:760px)').matches && !$('sidebar').classList.contains('open');
}
function openMargins() {
  if (matchMedia('(min-width:980px)').matches) { $('marginSidebar').inert=false; return; }
  closeContents();
  $('marginSidebar').inert=false; $('marginSidebar').classList.add('open'); $('marginShade').hidden=false;
  $('marginSidebar').setAttribute('role','dialog'); $('marginSidebar').setAttribute('aria-modal','true');
  $('marginToggle').setAttribute('aria-expanded','true');
  $('reader').inert=true; $('sidebar').inert=true; document.querySelector('.masthead').inert=true; document.querySelector('.skip').inert=true;
  $('closeMargins').focus();
}
function closeSearch() { if ($('searchDialog').open) $('searchDialog').close(); }

function appendResults() {
  const fragment = document.createDocumentFragment();
  for (const result of matches.slice(shown, shown + 40)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'search-result';
    const c = getChapter(result.page);
    const title = document.createElement('span'); title.className = 'result-title'; title.textContent = c ? `${c.number ? c.number + '. ' : ''}${c.title}` : 'Front matter';
    const page = document.createElement('span'); page.className = 'result-page';
    page.textContent = `PDF page ${result.page}${result.page >= 13 && result.page <= 591 ? ' · Book page ' + (result.page - 11) : ''}`;
    const excerpt = document.createElement('span'); excerpt.className = 'result-excerpt';
    const start = Math.max(0, result.position - 65), end = Math.min(result.text.length, result.position + result.query.length + 120);
    excerpt.append(document.createTextNode((start ? '…' : '') + result.text.slice(start, result.position)));
    const mark = document.createElement('mark'); mark.textContent = result.text.slice(result.position, result.position + result.query.length);
    excerpt.append(mark, document.createTextNode(result.text.slice(result.position + result.query.length, end) + (end < result.text.length ? '…' : '')));
    button.append(title, page, excerpt);
    button.addEventListener('click', () => { searchNavigation = true; closeSearch(); navigate(result.page); });
    fragment.append(button);
  }
  $('searchResults').append(fragment); shown = Math.min(shown + 40, matches.length); $('moreResults').hidden = shown >= matches.length;
}

$('searchForm').addEventListener('submit', e => {
  e.preventDefault(); const query = $('searchInput').value.trim().replace(/\s+/g, ' ');
  if (!query) return;
  matches = []; shown = 0; searchNavigation = false;
  const needle = query.toLowerCase();
  index.forEach((text, i) => { const position = text.toLowerCase().indexOf(needle); if (position >= 0) matches.push({ page: i + 1, text, position, query }); });
  $('searchResults').replaceChildren();
  $('searchStatus').textContent = pages.length ? `${matches.length} ${matches.length === 1 ? 'page' : 'pages'} matching “${query}”` : 'The text is still loading. Try again in a moment.';
  appendResults(); if (!$('searchDialog').open) $('searchDialog').showModal();
});
$('moreResults').addEventListener('click', appendResults);
$('closeSearch').addEventListener('click', closeSearch);
$('searchDialog').addEventListener('close', () => {
  if (searchNavigation) { $('chapterText').focus({ preventScroll: true }); searchNavigation = false; } else $('searchInput').focus();
});
$('searchDialog').addEventListener('click', e => { if (e.target === $('searchDialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeSearch(); } });
$('pageForm').addEventListener('submit', e => { e.preventDefault(); if ($('pageInput').checkValidity()) navigate($('pageInput').value); });
$('previous').addEventListener('click', () => { const ci = chapters.indexOf(getChapter(currentPage)); navigate(chapters[ci - 1]?.page || 1); });
$('next').addEventListener('click', () => { const ci = currentChapter === -3 ? -1 : chapters.indexOf(getChapter(currentPage)); navigate(chapters[ci + 1]?.page || total); });

function setFont(size) {
  fontSize = Math.max(14, Math.min(26, Number(size) || 16));
  document.documentElement.style.setProperty('--reading-size', `${fontSize}px`); $('zoomLabel').textContent = `${fontSize} px`;
  $('zoomOut').disabled = fontSize === 14; $('zoomIn').disabled = fontSize === 26;
  try { localStorage.setItem('fluid-reader-font-size-dense', String(fontSize)); } catch {}
}
$('zoomOut').addEventListener('click', () => setFont(fontSize - 1));
$('zoomIn').addEventListener('click', () => setFont(fontSize + 1));
$('fitWidth').addEventListener('click', () => setFont(16));
$('contentsToggle').addEventListener('click', () => {
  if ($('sidebar').classList.contains('open')) { closeContents(); return; }
  closeMargins(); $('sidebar').inert = false; $('sidebar').classList.add('open'); $('sidebarShade').hidden = false;
  $('marginSidebar').inert = true;
  $('reader').inert = true; document.querySelector('.masthead').inert = true; document.querySelector('.skip').inert = true;
  $('contentsToggle').setAttribute('aria-expanded', 'true'); $('closeContents').focus();
});
for (const id of ['closeContents', 'sidebarShade']) $(id).addEventListener('click', () => { closeContents(); $('contentsToggle').focus(); });
for (const id of ['closeMargins','marginShade']) $(id).addEventListener('click', () => { closeMargins(); $('marginToggle').focus(); });
$('marginToggle').addEventListener('click', () => { renderMargins(currentPage); openMargins(); });
document.querySelector('.study-shortcuts').addEventListener('click', () => closeContents());
for (const el of [document.querySelector('.skip'), $('backToTop')]) el.addEventListener('click', e => { e.preventDefault(); $('reader').focus({ preventScroll: true }); $('reader').scrollIntoView({ block: 'start' }); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('sidebar').classList.contains('open')) { closeContents(); $('contentsToggle').focus(); }
  if (e.key === 'Escape' && $('marginSidebar').classList.contains('open')) { closeMargins(); $('marginToggle').focus(); }
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input,textarea,[contenteditable]') && !$('searchDialog').open) { e.preventDefault(); closeContents(); closeMargins(); $('searchInput').focus(); }
});
window.addEventListener('hashchange', () => readRoute());
window.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame=requestAnimationFrame(trackReadingPosition); }, {passive:true});
window.addEventListener('resize', () => {
  const mobile = matchMedia('(max-width:760px)').matches;
  if (!mobile) closeContents(); else $('sidebar').inert = !$('sidebar').classList.contains('open');
  if (matchMedia('(min-width:980px)').matches) closeMargins(); else $('marginSidebar').inert = !$('marginSidebar').classList.contains('open');
  const toolbarHeight = document.querySelector('.toolbar').getBoundingClientRect().height;
  $('sectionProgress').style.top = `${toolbarHeight}px`;
});

closeContents(); closeMargins();
try { setFont(localStorage.getItem('fluid-reader-font-size-dense')); } catch { setFont(16); }
if (!/^#(?:page=\d+|browse=(?:equations|problems|figures))(?:&.*)?$/.test(location.hash) && location.hash !== '#contents') {
  let lastPage = 13, lastBlock = 0; try { lastPage = clamp(localStorage.getItem('fluid-reader-page') || 13); lastBlock = Number(localStorage.getItem('fluid-reader-block')) || 0; } catch {}
  history.replaceState(null, '', `#page=${lastPage}&block=${lastBlock}`);
}
try {
  const [response,imageResponse] = await Promise.all([fetch('text-pages.json'),fetch('image-manifest.json')]);
  if (!response.ok) throw new Error(`Text returned ${response.status}`);
  pages = await response.json();
  if (!Array.isArray(pages) || pages.length !== total) throw new Error('Incomplete text data');
  if (imageResponse.ok) {
    const manifest = await imageResponse.json();
    for (const record of manifest.pages || []) { sourceImages.set(record.page,record.images || []); imageRecords.set(record.page,record); }
    pages = pages.map(page => ({...page,blocks:page.blocks.map(block => block.type === 'figure' && manifest.diagrams?.[block.src] ? {...block,...manifest.diagrams[block.src]} : block)}));
  }
  pages = applyImageRestorations(pages,imageRecords);
  buildNavigation();
  studyBrowser = createStudyBrowser({ pages, chapters, sourceImages:[...sourceImages.entries()].flatMap(([page,images]) => images.map(entry => ({...entry,page}))), onNavigate:navigate,
    onStateChange:state => {
      if (routeMode !== 'study') return;
      const params = new URLSearchParams({browse:state.type,chapter:state.chapter,q:state.query,notesOnly:state.notesOnly?'1':'0',numberedOnly:state.numberedOnly?'1':'0'});
      history.replaceState(null,'',`#${params}`);
      document.querySelectorAll('.study-shortcuts a').forEach(a => a.toggleAttribute('aria-current',a.hash.includes(state.type)));
    }
  });
  $('studyView').replaceChildren(studyBrowser.element);
  const compared = pages.filter(page => page.review).length;
  const verified = pages.filter(page => page.review?.status === 'verified').length;
  const pending = pages.filter(page => page.review?.status === 'needs_astra').length;
  $('reviewProgress').textContent = compared === total && !pending
    ? `All ${total} pages visually compared. Source errors and unreadable passages are annotated.`
    : `${compared} of ${total} pages visually compared · ${verified} checked without unresolved transcription issues.`;
  index = pages.map(page => page.blocks.map(block => [block.text || '', ...(block.columns || []), ...(block.rows || []).flat()].join(' ')).join(' ').replace(/\s+/g, ' '));
  readRoute({ scroll: false });
  const first = getChapter(currentPage)?.page || 1;
  if (routeMode === 'read' && (currentPage !== first || new URLSearchParams(location.hash.slice(1)).has('block'))) readRoute();
  new ResizeObserver(() => { $('sectionProgress').style.top = `${document.querySelector('.toolbar').getBoundingClientRect().height}px`; }).observe(document.querySelector('.toolbar'));
} catch (error) {
  const message = document.createElement('p'); message.setAttribute('role', 'alert');
  message.textContent = 'The transcription could not be loaded. Check your connection and reload this page.';
  $('chapterText').replaceChildren(message); console.error(error);
}

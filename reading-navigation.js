const STORAGE_KEY = 'fluid-reader-reading-progress-v1';

// These headings use descriptive sentences rather than the short contents title.
// Values are block indices in the checked transcription, not printed page numbers.
const HEADING_BLOCKS = {
  '1.1': 4, '1.2': 1, '1.3': 7, '1.4': 2, '1.5': 9, '1.6': 1, '1.7': 0,
  '1.9': 8, '1.10': 4, '1.11': 1,
  '3.1': 2, '3.2': 10, '3.3': 2, '3.4': 0, '3.5': 0, '3.6': 5, '3.7': 1,
  '4.1': 2, '4.2': 3, '4.3': 1, '4.4': 3, '4.5': 8, '4.6': 3, '4.7': 1,
  '5.1': 2, '5.2': 8, '5.3': 3, '5.4': 4, '5.5': 14,
  '6.1': 2, '6.2': 2, '6.3': 2, '6.4': 7, '6.5': 10,
  '7.1': 2, '7.2': 4, '7.3': 5, '7.4': 4, '7.5': 13, '7.6': 0, '7.7': 0,
  '8.1': 2, '8.2': 1, '8.3': 1, '8.4': 10, '8.5': 5, '8.6': 11, '8.7': 0, '8.8': 0,
  '9.1': 2, '9.2': 0, '9.3': 0, '9.4': 6, '9.5': 2, '9.6': 1, '9.7': 3, '9.8': 1, '9.9': 0,
  '11.4': 2, '11.5': 0, '11.6': 2, '11.7': 9, '11.8': 0, '11.9': 2,
  '11.10': 8, '11.11': 5, '11.12': 0,
  'A.1': 2,
  'B.1': 2, 'B.2': 0, 'B.3': 6, 'B.4': 9, 'B.5': 9, 'B.6': 14, 'B.7': 0,
  'B.8': 12, 'B.9': 0, 'B.10': 11, 'B.11': 12, 'B.12': 4, 'B.13': 10, 'B.14': 0, 'B.15': 2,
};

const isHeading = block => block?.type === 'heading' || block?.type === 'subheading';
const normalized = text => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sectionHref = section => `#page=${section.page}${Number.isInteger(section.blockIndex) ? `&block=${section.blockIndex}` : ''}`;

function findHeading(page, number, title) {
  const blocks = page?.blocks || [];
  const explicit = HEADING_BLOCKS[number];
  if (Number.isInteger(explicit) && isHeading(blocks[explicit])) return explicit;
  const prefix = new RegExp(`^${escapeRegExp(number)}(?:\\.(?!\\d)|\\s|$)`);
  const numbered = blocks.findIndex(block => isHeading(block) && prefix.test(block.text));
  if (numbered >= 0) return numbered;
  const exact = blocks.findIndex(block => isHeading(block) && normalized(block.text) === normalized(title));
  return exact >= 0 ? exact : null;
}

/** Build stable, source-backed study portions without changing source blocks. */
export function buildReadingSections(pages, chapters) {
  const byPage = new Map(pages.map(page => [page.page, page]));
  const sections = [];
  const seen = new Set();
  for (const page of pages.filter(page => page.page >= 4 && page.page <= 12)) {
    for (const table of page.blocks.filter(block => block.type === 'table')) {
      (table.rows || []).forEach((row, rowIndex) => {
        const number = String(row[0] || '').trim();
        if (!/^(?:\d+|[A-Z])\.\d+$/.test(number) || seen.has(number)) return;
        const chapter = chapters.find(item => item.number === number.split('.')[0]);
        const target = Number(table.pageTargets?.[rowIndex]);
        if (!chapter || !byPage.has(target)) return;
        seen.add(number);
        sections.push({
          id: `section-${number}`, number, title: String(row[1]), page: target,
          blockIndex: findHeading(byPage.get(target), number, row[1]), chapter,
          chapterId: `chapter-${chapter.number || 'index'}`,
        });
      });
    }
  }
  chapters.forEach(chapter => {
    if (sections.some(section => section.chapter === chapter)) return;
    sections.push({
      id: `reference-${chapter.number || 'index'}`, number: chapter.number || '',
      title: chapter.title, page: chapter.page, blockIndex: null, chapter,
      chapterId: `chapter-${chapter.number || 'index'}`,
    });
  });
  sections.sort((a, b) => a.page - b.page || (a.blockIndex ?? -1) - (b.blockIndex ?? -1));
  sections.forEach((section, index) => {
    const next = sections[index + 1];
    section.endPage = next?.page ?? pages[pages.length - 1]?.page ?? section.page;
    section.endBlockIndex = next?.blockIndex ?? null;
    section.href = sectionHref(section);
  });
  return sections;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function makeProgress(label) {
  const track = el('div', 'reading-progress-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuemin', '0');
  const fill = el('span', 'reading-progress-fill');
  track.append(fill);
  return { track, fill };
}

export function createReadingNavigation({ pages, chapters, onNavigate, onSectionChange }) {
  const sections = buildReadingSections(pages, chapters);
  const validIds = new Set(sections.map(section => section.id));
  const completed = new Set();
  const sectionNodes = new Map();
  const chapterNodes = new Map();
  let currentSection = null;
  let activeChapter = null;
  let storageError = '';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.version !== 1 || !Array.isArray(parsed.completed)) throw new Error('Invalid progress data');
      parsed.completed.filter(id => validIds.has(id)).forEach(id => completed.add(id));
    }
  } catch {
    storageError = 'Saved progress could not be read. Changes will try to save again.';
  }

  const element = el('div', 'reading-navigation');
  const contentsLink = el('a', 'front-link', 'Book contents');
  contentsLink.href = '#contents';
  element.append(contentsLink);

  const progressElement = el('section', 'reading-progress');
  progressElement.setAttribute('aria-label', 'Study progress');
  const progressHeading = el('div', 'reading-progress-heading');
  const progressLabel = el('strong', '', 'Study progress');
  const overallCount = el('span', 'reading-progress-count');
  const overall = makeProgress('Completed study portions');
  const progressNotice = el('p', 'reading-progress-notice');
  progressNotice.setAttribute('role', 'status');
  progressHeading.append(progressLabel, overallCount);
  progressElement.append(progressHeading, overall.track, progressNotice);

  const sectionControl = el('div', 'reading-section-control');
  const currentTitle = el('span', 'reading-current-title');
  const completeLabel = el('label', 'reading-complete-control');
  const completeCheckbox = el('input');
  completeCheckbox.type = 'checkbox';
  const completeText = el('span', '', 'Complete');
  completeLabel.append(completeCheckbox, completeText);
  const nextButton = el('button', 'reading-next-unfinished', 'Next unfinished →');
  nextButton.type = 'button';
  sectionControl.append(currentTitle, completeLabel, nextButton);
  sectionControl.hidden = true;

  function navigate(section, event) {
    if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0)) return;
    if (typeof onNavigate !== 'function') return;
    event?.preventDefault();
    onNavigate(section.page, section.blockIndex);
  }

  chapters.forEach((chapter, chapterIndex) => {
    const portions = sections.filter(section => section.chapter === chapter);
    if (chapterIndex === 0 || chapterIndex === 11) {
      element.append(el('div', 'nav-group-label', chapterIndex === 0 ? 'Chapters' : 'Appendices & index'));
    }
    const group = el('div', 'reading-chapter');
    const row = el('div', 'reading-chapter-row');
    const chapterLink = el('a', 'reading-chapter-link');
    chapterLink.href = `#page=${chapter.page}`;
    chapterLink.append(el('span', 'reading-chapter-number', chapter.number || '—'), el('span', '', chapter.title));
    chapterLink.addEventListener('click', event => navigate({ page: chapter.page, blockIndex: null }, event));
    const toggle = el('button', 'reading-chapter-toggle');
    toggle.type = 'button';
    const list = el('ul', 'reading-section-list');
    list.id = `reading-sections-${chapter.number || 'index'}`;
    list.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', list.id);
    toggle.setAttribute('aria-label', `Expand ${chapter.title}`);
    const chevron = el('span', '', '›');
    chevron.setAttribute('aria-hidden', 'true');
    toggle.append(chevron);
    row.append(chapterLink, toggle);
    const meterRow = el('div', 'reading-chapter-meter');
    const chapterProgress = makeProgress(`${chapter.title} completed portions`);
    const count = el('span', 'reading-chapter-count');
    meterRow.append(chapterProgress.track, count);
    group.append(row, meterRow, list);
    const nodes = { group, chapterLink, toggle, list, portions, count, ...chapterProgress };
    chapterNodes.set(chapter, nodes);
    toggle.addEventListener('click', () => setExpanded(nodes, list.hidden));
    portions.forEach(section => {
      const item = el('li', 'reading-section-row');
      const checkbox = el('input', 'reading-section-checkbox');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('aria-label', `Mark ${section.number ? `${section.number} ` : ''}${section.title} complete`);
      const link = el('a', 'reading-section-link');
      link.href = section.href;
      if (section.number && !section.id.startsWith('reference-')) link.append(el('span', 'reading-section-number', section.number));
      link.append(el('span', '', section.title));
      link.addEventListener('click', event => navigate(section, event));
      checkbox.addEventListener('change', () => setComplete(section, checkbox.checked));
      item.append(checkbox, link);
      list.append(item);
      sectionNodes.set(section.id, { item, checkbox, link });
    });
    element.append(group);
  });

  function setExpanded(nodes, expanded) {
    nodes.list.hidden = !expanded;
    nodes.toggle.setAttribute('aria-expanded', String(expanded));
    nodes.toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${nodes.portions[0].chapter.title}`);
  }

  function setMeter(meter, done, total) {
    meter.fill.style.width = `${total ? 100 * done / total : 0}%`;
    meter.track.setAttribute('aria-valuemax', String(total));
    meter.track.setAttribute('aria-valuenow', String(done));
    meter.track.setAttribute('aria-valuetext', `${done} of ${total} complete`);
  }

  function getNextUnfinished() {
    const start = currentSection ? sections.indexOf(currentSection) + 1 : 0;
    const ordered = [...sections.slice(start), ...sections.slice(0, start)];
    return ordered.find(section => !completed.has(section.id));
  }

  function refreshProgress() {
    overallCount.textContent = `${completed.size} / ${sections.length}`;
    overallCount.setAttribute('aria-label', `${completed.size} of ${sections.length} portions complete`);
    setMeter(overall, completed.size, sections.length);
    progressNotice.hidden = !storageError;
    progressNotice.textContent = storageError;
    chapterNodes.forEach(nodes => {
      const done = nodes.portions.filter(section => completed.has(section.id)).length;
      nodes.count.textContent = `${done}/${nodes.portions.length}`;
      setMeter(nodes, done, nodes.portions.length);
      nodes.group.classList.toggle('is-complete', done === nodes.portions.length);
    });
    sectionNodes.forEach((nodes, id) => {
      const done = completed.has(id);
      nodes.checkbox.checked = done;
      nodes.item.classList.toggle('is-complete', done);
    });
    refreshSectionControl();
  }

  function refreshSectionControl() {
    sectionControl.hidden = !currentSection;
    if (!currentSection) return;
    currentTitle.textContent = `${currentSection.number ? currentSection.number + ' ' : ''}${currentSection.title}`;
    completeCheckbox.checked = completed.has(currentSection.id);
    completeCheckbox.setAttribute('aria-label', `Mark ${currentTitle.textContent} complete`);
    completeText.textContent = completeCheckbox.checked ? 'Completed' : 'Complete';
    const next = getNextUnfinished();
    nextButton.disabled = !next;
    nextButton.textContent = next ? 'Next unfinished →' : 'All portions complete';
    nextButton.title = next ? `${next.number ? next.number + ' ' : ''}${next.title}` : '';
  }

  function setComplete(section, done) {
    if (done) completed.add(section.id); else completed.delete(section.id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, completed: [...completed] }));
      storageError = '';
    } catch {
      storageError = 'Progress is kept for this visit only; browser storage is unavailable.';
    }
    refreshProgress();
  }

  completeCheckbox.addEventListener('change', () => {
    if (currentSection) setComplete(currentSection, completeCheckbox.checked);
  });
  nextButton.addEventListener('click', () => {
    const next = getNextUnfinished();
    if (next) navigate(next);
  });

  function sectionAt(page, blockIndex = 0) {
    const chapter = [...chapters].reverse().find(item => item.page <= page);
    if (!chapter) return null;
    const portions = chapterNodes.get(chapter).portions;
    return [...portions].reverse().find(section => section.page < page || (section.page === page && (section.blockIndex ?? 0) <= blockIndex)) || portions[0];
  }

  function update(page, blockIndex = 0) {
    const nextSection = sectionAt(Number(page), Number(blockIndex) || 0);
    const nextChapter = nextSection?.chapter || null;
    if (nextChapter !== activeChapter) {
      if (activeChapter) {
        const previous = chapterNodes.get(activeChapter);
        previous.group.classList.remove('is-active');
        previous.chapterLink.removeAttribute('aria-current');
      }
      activeChapter = nextChapter;
      if (activeChapter) {
        const nodes = chapterNodes.get(activeChapter);
        nodes.group.classList.add('is-active');
        nodes.chapterLink.setAttribute('aria-current', 'location');
        setExpanded(nodes, true);
      }
    }
    if (nextSection !== currentSection) {
      if (currentSection) sectionNodes.get(currentSection.id).link.removeAttribute('aria-current');
      currentSection = nextSection;
      if (currentSection) sectionNodes.get(currentSection.id).link.setAttribute('aria-current', 'location');
      refreshSectionControl();
      onSectionChange?.(currentSection);
    }
    return currentSection;
  }

  function onStorage(event) {
    if (event.key !== STORAGE_KEY) return;
    try {
      const value = event.newValue ? JSON.parse(event.newValue) : { version: 1, completed: [] };
      if (value.version !== 1 || !Array.isArray(value.completed)) return;
      completed.clear();
      value.completed.filter(id => validIds.has(id)).forEach(id => completed.add(id));
      storageError = '';
      refreshProgress();
    } catch { /* Keep the current state if another tab writes invalid data. */ }
  }
  window.addEventListener('storage', onStorage);
  refreshProgress();

  return {
    element, progressElement, sectionControl, sections, update, sectionAt,
    getCurrentSection: () => currentSection,
    getProgress: () => ({ completed: completed.size, total: sections.length, ids: [...completed], persisted: !storageError }),
    destroy: () => window.removeEventListener('storage', onStorage),
  };
}

import katex from './vendor/katex/katex.mjs';
import { isVectorDiagram } from './image-policy.js';

const options = { throwOnError: true, trust: false, strict: 'ignore', output: 'htmlAndMathml', maxSize: 20, maxExpand: 1000 };

export function renderMath(text, element, displayMode = false) {
  try {
    katex.render(text, element, { ...options, displayMode });
    return true;
  } catch (error) {
    element.classList.add('math-error');
    element.textContent = text;
    element.title = 'Equation formatting needs review';
    console.error('Math rendering failed:', error.message);
    return false;
  }
}

export function appendRichText(element, text) {
  const pattern = /\\\(([\s\S]*?)\\\)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    element.append(document.createTextNode(text.slice(cursor, match.index)));
    const math = document.createElement('span'); math.className = 'inline-math';
    renderMath(match[1], math); element.append(math);
    cursor = match.index + match[0].length;
  }
  element.append(document.createTextNode(text.slice(cursor)));
}

export function renderBlock(block) {
  if (block.type === 'table') {
    const wrapper = document.createElement('div'); wrapper.className = 'table-scroll';
    const table = document.createElement('table');
    if (block.text) { const caption = document.createElement('caption'); appendRichText(caption, block.text); table.append(caption); }
    if (block.columns?.length) {
      const head = document.createElement('thead'), row = document.createElement('tr');
      for (const value of block.columns) { const cell = document.createElement('th'); cell.scope = 'col'; appendRichText(cell, String(value)); row.append(cell); }
      head.append(row); table.append(head);
    }
    const body = document.createElement('tbody');
    for (const [rowIndex, values] of (block.rows || []).entries()) {
      const row = document.createElement('tr');
      for (const [columnIndex, value] of values.entries()) {
        const cell = document.createElement('td');
        const target = block.pageTargets?.[rowIndex];
        if (columnIndex === values.length - 1 && Number.isInteger(target) && target >= 1 && target <= 596) {
          const link = document.createElement('a'); link.href = `#page=${target}`;
          link.title = `Open PDF page ${target}`; appendRichText(link, String(value)); cell.append(link);
        } else if (columnIndex === values.length - 1 && Number.isInteger(block.printedPageOffset)) {
          for (const part of String(value).split(/(\d+)/)) {
            const page = /^\d+$/.test(part) ? Number(part) + block.printedPageOffset : 0;
            if (page >= 1 && page <= 596) {
              const link = document.createElement('a'); link.href = `#page=${page}`;
              link.title = `Printed page ${part} · PDF page ${page}`; link.textContent = part; cell.append(link);
            } else cell.append(document.createTextNode(part));
          }
        } else appendRichText(cell, String(value));
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body); wrapper.append(table); return wrapper;
  }
  if (block.type === 'math') {
    const equation = document.createElement('div'); equation.className = 'equation';
    const formula = document.createElement('div'); formula.className = 'equation-formula';
    renderMath(block.text, formula, true); equation.append(formula);
    if (block.number) {
      const number = document.createElement('span'); number.className = 'equation-number'; number.textContent = `(${block.number})`; equation.append(number);
    }
    return equation;
  }
  if (block.type === 'figure' && isVectorDiagram(block.src)) {
    const figure = document.createElement('figure'); figure.className = 'redrawn-figure';
    const img = document.createElement('img'); img.src = block.src; img.alt = block.alt || ''; img.loading = 'lazy'; figure.append(img);
    if (block.width && block.height) { img.width = block.width; img.height = block.height; }
    if (block.text) { const caption = document.createElement('figcaption'); appendRichText(caption, block.text); figure.append(caption); }
    return figure;
  }
  const el = document.createElement(block.type === 'heading' ? 'h4' : block.type === 'note' ? 'aside' : 'p');
  if (block.type === 'note') el.className = 'margin-note';
  if (/^(Editorial|Transcription)\b/.test(block.text || '')) el.classList.add('editorial-note');
  if (block.type === 'caption') el.className = 'figure-caption';
  appendRichText(el, block.text || '');
  return el;
}

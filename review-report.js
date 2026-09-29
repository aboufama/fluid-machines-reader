const data = await fetch('review-status.json').then(response => { if (!response.ok) throw new Error('Review record unavailable'); return response.json(); });
document.getElementById('progress').textContent = `${data.visually_compared} of ${data.total} pages visually compared. ${data.verified} checked without unresolved transcription issues; ${data.needs_astra} need further review; ${data.source_issues || 0} have documented source issues. ${data.diagrams_pending || 0} diagrams await redraw. ${data.equations_checked} equation review entries recorded.`;
const records = new Map(data.pages.map(page => [page.page, page]));
const grid = document.getElementById('grid');
for (let n = 1; n <= data.total; n++) {
  const record = records.get(n), a = document.createElement('a');
  a.href = `index.html#page=${n}`; a.className = `page ${record?.status || ''}`; a.textContent = n;
  a.title = `PDF page ${n}: ${record?.status === 'verified' ? 'Visually checked' : record?.status === 'source_issue' ? 'Source issue documented' : record ? 'Further review needed' : 'Not yet reviewed'}`; grid.append(a);
}
const findings = document.getElementById('findings');
for (const record of data.pages.filter(page => page.unresolved.length || page.figure_requests.some(figure => !figure.completed))) {
  const item = document.createElement('section'); item.className = 'finding';
  const link = document.createElement('a'); link.href = `index.html#page=${record.page}`; link.textContent = `PDF page ${record.page}`; item.append(link);
  for (const finding of record.unresolved) { const p = document.createElement('p'); p.textContent = finding; item.append(p); }
  const pendingFigures = record.figure_requests.filter(figure => !figure.completed);
  if (pendingFigures.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Diagram redraws: ' + pendingFigures.map(figure => figure.figure).join(', '); item.append(p); }
  findings.append(item);
}
if (!findings.children.length) findings.textContent = 'No unresolved findings in the pages reviewed so far.';

try {
  const [drawings, sources, images, equations] = await Promise.all(['illustration-review.json', 'source-review.json', 'image-manifest.json', 'equation-review.json'].map(async file => {
    const response = await fetch(file);
    if (!response.ok) throw new Error('Illustration review unavailable');
    return response.json();
  }));
  const equationSection=document.createElement('section');
  const equationHeading=document.createElement('h2');equationHeading.textContent='Final equation check';
  const equationProgress=document.createElement('p');equationProgress.textContent=`Mathematics reread on ${equations.pages_reviewed} of ${equations.total_pages} pages. ${equations.transcription_repairs} transcription fixes and ${equations.source_clarifications} source clarifications applied. ${equations.rendered_expressions.toLocaleString()} expressions render without errors, including ${equations.display_equations.toLocaleString()} displayed equations. ${equations.numbered_equations.toLocaleString()} numbered equations have ${Object.keys(equations.duplicate_numbers).length} duplicate labels.`;
  const equationMethod=document.createElement('p');equationMethod.textContent=`${equations.fresh_source_comparison_pages.length} pages received fresh source-image comparison in this pass; the remaining pages use the previous visual audit. Source errors and unreadable symbols remain annotated.`;
  equationSection.append(equationHeading,equationProgress,equationMethod);
  const repairs=document.createElement('details'),repairTitle=document.createElement('summary');repairTitle.textContent='Applied transcription fixes';repairs.append(repairTitle);
  for(const repair of equations.repairs){const p=document.createElement('p'),a=document.createElement('a');a.href=`index.html#page=${repair.page}&block=${repair.blockIndex}`;a.textContent=`PDF page ${repair.page}${repair.equation ? ` · Equation ${repair.equation}` : ''}`;p.append(a,document.createTextNode(` — ${repair.evidence}`));repairs.append(p);}
  equationSection.append(repairs);document.getElementById('illustrations').before(equationSection);
  document.getElementById('illustration-progress').textContent = `${images.reviewed} of ${images.total} pages checked for image placement. ${drawings.checked} of ${drawings.total} unique vector drawings visually compared with the source; ${drawings.improved} improved in the final pass. Reconstructed or qualitative plots remain labeled as such.`;
  document.getElementById('source-progress').textContent = `${sources.counts.matched || 0} figure placements have matching external originals; ${sources.counts.partial_match || 0} have some original panels or source video frames recovered. ${sources.counts.not_found || 0} source lookups remain unresolved, including repeated margin portraits. These counts include figures reused on multiple pages. No images from the scanned book are displayed. Missing originals are marked unavailable, and unrecovered margin portraits are omitted.`;
  const container = document.getElementById('source-records');
  for (const [statuses, title] of [[['matched', 'partial_match'], 'Recovered source images'], [['not_found'], 'Unresolved image sources']]) {
    const entries = sources.records.filter(record => statuses.includes(record.status));
    const details = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = `${title} (${entries.length})`; details.append(summary);
    for (const record of entries) {
      const section = document.createElement('section'); section.className = 'finding';
      const link = document.createElement('a'); link.href = `index.html#page=${record.page}`; link.textContent = `PDF page ${record.page}`; section.append(link);
      if (record.status === 'partial_match') section.append(document.createTextNode(record.matchType === 'source_footage' ? ' · Source footage; approximate frame' : ' · Some panels recovered'));
      const note = document.createElement('p'); note.textContent = record.notes; section.append(note);
      const credits = record.assets?.length ? record.assets : [record];
      for (const credit of credits) {
        if (!credit.sourceUrl || record.status === 'not_found') continue;
        const p = document.createElement('p'), source = document.createElement('a');
        source.href = credit.sourceUrl; source.textContent = credit.creator || 'Image source'; source.target = '_blank'; source.rel = 'noopener'; p.append(source);
        if (credit.license) p.append(document.createTextNode(` · ${credit.license}`));
        section.append(p);
      }
      details.append(section);
    }
    container.append(details);
  }
} catch {
  document.getElementById('illustration-progress').textContent = 'Illustration review could not be loaded. Reload to try again.';
}

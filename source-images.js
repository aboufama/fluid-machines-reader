import { appendRichText } from './math-render.js';
import { externalAssets, isVectorDiagram } from './image-policy.js';

function makeImage(src,alt,width,height) {
  const img = document.createElement('img');
  img.src=src; img.alt=alt||''; img.loading='lazy'; img.decoding='async';
  if(width&&height){img.width=width;img.height=height;}
  return img;
}
function sourceCredit(source) {
  const credit=document.createElement('div'); credit.className='source-credit';
  const link=document.createElement('a'); link.href=source.sourceUrl; link.target='_blank'; link.rel='noopener';
  link.textContent=source.creator ? `Source: ${source.creator}` : 'Image source';
  if(source.matchType === 'source_footage')credit.append(document.createTextNode('Source video frame · Exact book frame not confirmed. '));
  credit.append(link);
  const license=source.license?.match(/CC\s+BY(?:-SA|-NC-SA|-NC|-ND)?\s+\d\.\d/i)?.[0];
  if(license){const terms=document.createElement('a');terms.textContent=license;terms.href=`https://creativecommons.org/licenses/${license.replace(/^CC\s+/i,'').toLowerCase().replace(/\s+/g,'/')}/`;terms.target='_blank';terms.rel='noopener';credit.append(document.createTextNode(' · '),terms);}
  else if(/public domain/i.test(source.license||''))credit.append(document.createTextNode(' · Public domain'));
  return credit;
}
export function renderSourceImage(entry, originalBlock) {
  const figure=document.createElement('figure'); figure.className='source-figure';
  if(entry.kind==='decoration')figure.classList.add('source-decoration');
  const hasRedraw=originalBlock?.type==='figure' && isVectorDiagram(originalBlock.src);
  const assets=externalAssets(entry);
  if(assets.length) {
    const gallery=document.createElement('div'); gallery.className='source-gallery';
    for(const asset of assets) {
      const panel=document.createElement('div');
      panel.append(makeImage(asset.src,asset.alt,asset.width,asset.height),sourceCredit(asset.provenance));
      gallery.append(panel);
    }
    figure.append(gallery);
    if(entry.sourceStatus==='partial_match' && !hasRedraw && assets.every(asset=>asset.provenance.matchType!=='source_footage')) {
      const note=document.createElement('p');note.className='image-unavailable';note.textContent='Remaining original image panels unavailable.';figure.append(note);
    }
  }
  if(hasRedraw)figure.append(makeImage(originalBlock.src,originalBlock.alt,originalBlock.width,originalBlock.height));
  if(!assets.length&&!hasRedraw) {
    const note=document.createElement('p');note.className='image-unavailable';note.textContent='Original image unavailable.';figure.append(note);
  }
  if(originalBlock?.text){const caption=document.createElement('figcaption');appendRichText(caption,originalBlock.text);figure.append(caption);}
  for(const img of figure.querySelectorAll('img')) {
    const link=document.createElement('a');link.className='figure-full-size';link.href=img.src;link.target='_blank';link.rel='noopener';link.title='Open illustration full size';
    img.replaceWith(link);link.append(img);
  }
  return figure;
}

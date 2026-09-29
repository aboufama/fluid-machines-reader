// Only independently sourced raster assets and locally drawn vectors belong in the reader.
export const isVectorDiagram = src => /^diagrams\/[\w.-]+\.svg$/.test(src || '');
export function externalAssets(entry) {
  if (!['matched', 'partial_match'].includes(entry.sourceStatus)) return [];
  return (entry.assets || []).filter(asset => /^images\/original-[\w.-]+\.(?:png|jpg|webp)$/.test(asset.src || '') && /^https:\/\//.test(asset.provenance?.sourceUrl || ''));
}

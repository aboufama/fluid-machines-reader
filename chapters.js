export const chapters = [
 ['1','Rocket Nozzles',13],['2','Turbomachines',59],['3','Dams',82],['4','Boats',119],['5','Carbs and Converters',146],['6','Pumps and Pipes',204],['7','Rotors',246],['8','Flow Viz',284],['9','Airfoils',311],['10','Drag-reducing Devices',365],['11','Bearings',395],
 ['A','Engineering Models',430],['B','Vector Algebra and Calculus',449],['C','Dimensional Analysis and Similitude',500],['D','Differential Inviscid Conservation of Momentum',520],['E','Fluid Deformation',532],['F','Viscous Stresses',539],['G','Glossary of Terms You Should Know',555],['H','Units and Nomenclature',583],['','Index',586]
].map(([number,title,page])=>({number,title,page,printedPage:page-11}));

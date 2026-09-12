import { ChemistryEngine, type ChemicalReagent } from '../../chemistry/ChemistryEngine.ts';

export interface PeriodicElement {
  number: number;
  symbol: string;
  name: string;
  enName: string;
  mass: number;
  period: number;
  group: number;
  category:
    | 'alkali-metal'
    | 'alkaline-earth'
    | 'transition-metal'
    | 'post-transition'
    | 'metalloid'
    | 'reactive-nonmetal'
    | 'noble-gas'
    | 'lanthanide'
    | 'actinide';
  electronConfig: string;
  oxidationStates: string;
  reagentIds: string[];
}

export class PeriodicTableModal {
  public element: HTMLElement;

  public static readonly ELEMENTS: PeriodicElement[] = [
    // Period 1
    { number: 1, symbol: 'H', name: '氢', enName: 'Hydrogen', mass: 1.008, period: 1, group: 1, category: 'reactive-nonmetal', electronConfig: '1s¹', oxidationStates: '+1, -1', reagentIds: ['HCl', 'H2SO4', 'H2O2', 'H2O'] },
    { number: 2, symbol: 'He', name: '氦', enName: 'Helium', mass: 4.0026, period: 1, group: 18, category: 'noble-gas', electronConfig: '1s²', oxidationStates: '0', reagentIds: [] },

    // Period 2
    { number: 3, symbol: 'Li', name: '锂', enName: 'Lithium', mass: 6.94, period: 2, group: 1, category: 'alkali-metal', electronConfig: '[He] 2s¹', oxidationStates: '+1', reagentIds: [] },
    { number: 4, symbol: 'Be', name: '铍', enName: 'Beryllium', mass: 9.0122, period: 2, group: 2, category: 'alkaline-earth', electronConfig: '[He] 2s²', oxidationStates: '+2', reagentIds: [] },
    { number: 5, symbol: 'B', name: '硼', enName: 'Boron', mass: 10.81, period: 2, group: 13, category: 'metalloid', electronConfig: '[He] 2s² 2p¹', oxidationStates: '+3', reagentIds: [] },
    { number: 6, symbol: 'C', name: '碳', enName: 'Carbon', mass: 12.011, period: 2, group: 14, category: 'reactive-nonmetal', electronConfig: '[He] 2s² 2p²', oxidationStates: '+4, +2, -4', reagentIds: ['Na2CO3', 'phenolphthalein'] },
    { number: 7, symbol: 'N', name: '氮', enName: 'Nitrogen', mass: 14.007, period: 2, group: 15, category: 'reactive-nonmetal', electronConfig: '[He] 2s² 2p³', oxidationStates: '+5, +3, -3', reagentIds: ['AgNO3'] },
    { number: 8, symbol: 'O', name: '氧', enName: 'Oxygen', mass: 15.999, period: 2, group: 16, category: 'reactive-nonmetal', electronConfig: '[He] 2s² 2p⁴', oxidationStates: '-2, -1', reagentIds: ['H2O', 'H2O2', 'KMnO4'] },
    { number: 9, symbol: 'F', name: '氟', enName: 'Fluorine', mass: 18.998, period: 2, group: 17, category: 'reactive-nonmetal', electronConfig: '[He] 2s² 2p⁵', oxidationStates: '-1', reagentIds: [] },
    { number: 10, symbol: 'Ne', name: '氖', enName: 'Neon', mass: 20.180, period: 2, group: 18, category: 'noble-gas', electronConfig: '[He] 2s² 2p⁶', oxidationStates: '0', reagentIds: [] },

    // Period 3
    { number: 11, symbol: 'Na', name: '钠', enName: 'Sodium', mass: 22.990, period: 3, group: 1, category: 'alkali-metal', electronConfig: '[Ne] 3s¹', oxidationStates: '+1', reagentIds: ['Na', 'NaOH', 'Na2CO3', 'NaCl'] },
    { number: 12, symbol: 'Mg', name: '镁', enName: 'Magnesium', mass: 24.305, period: 3, group: 2, category: 'alkaline-earth', electronConfig: '[Ne] 3s²', oxidationStates: '+2', reagentIds: ['Mg'] },
    { number: 13, symbol: 'Al', name: '铝', enName: 'Aluminium', mass: 26.982, period: 3, group: 13, category: 'post-transition', electronConfig: '[Ne] 3s² 3p¹', oxidationStates: '+3', reagentIds: [] },
    { number: 14, symbol: 'Si', name: '硅', enName: 'Silicon', mass: 28.085, period: 3, group: 14, category: 'metalloid', electronConfig: '[Ne] 3s² 3p²', oxidationStates: '+4, -4', reagentIds: [] },
    { number: 15, symbol: 'P', name: '磷', enName: 'Phosphorus', mass: 30.974, period: 3, group: 15, category: 'reactive-nonmetal', electronConfig: '[Ne] 3s² 3p³', oxidationStates: '+5, +3, -3', reagentIds: [] },
    { number: 16, symbol: 'S', name: '硫', enName: 'Sulfur', mass: 32.06, period: 3, group: 16, category: 'reactive-nonmetal', electronConfig: '[Ne] 3s² 3p⁴', oxidationStates: '+6, +4, -2', reagentIds: ['H2SO4', 'CuSO4', 'FeSO4'] },
    { number: 17, symbol: 'Cl', name: '氯', enName: 'Chlorine', mass: 35.45, period: 3, group: 17, category: 'reactive-nonmetal', electronConfig: '[Ne] 3s² 3p⁵', oxidationStates: '+7, +5, +3, +1, -1', reagentIds: ['HCl', 'NaCl', 'BaCl2', 'FeCl3'] },
    { number: 18, symbol: 'Ar', name: '氩', enName: 'Argon', mass: 39.948, period: 3, group: 18, category: 'noble-gas', electronConfig: '[Ne] 3s² 3p⁶', oxidationStates: '0', reagentIds: [] },

    // Period 4
    { number: 19, symbol: 'K', name: '钾', enName: 'Potassium', mass: 39.098, period: 4, group: 1, category: 'alkali-metal', electronConfig: '[Ar] 4s¹', oxidationStates: '+1', reagentIds: ['KOH', 'KMnO4'] },
    { number: 20, symbol: 'Ca', name: '钙', enName: 'Calcium', mass: 40.078, period: 4, group: 2, category: 'alkaline-earth', electronConfig: '[Ar] 4s²', oxidationStates: '+2', reagentIds: ['Ca(OH)2'] },
    { number: 21, symbol: 'Sc', name: '钪', enName: 'Scandium', mass: 44.956, period: 4, group: 3, category: 'transition-metal', electronConfig: '[Ar] 3d¹ 4s²', oxidationStates: '+3', reagentIds: [] },
    { number: 22, symbol: 'Ti', name: '钛', enName: 'Titanium', mass: 47.867, period: 4, group: 4, category: 'transition-metal', electronConfig: '[Ar] 3d² 4s²', oxidationStates: '+4, +3', reagentIds: [] },
    { number: 23, symbol: 'V', name: '钒', enName: 'Vanadium', mass: 50.942, period: 4, group: 5, category: 'transition-metal', electronConfig: '[Ar] 3d³ 4s²', oxidationStates: '+5, +4, +3, +2', reagentIds: [] },
    { number: 24, symbol: 'Cr', name: '铬', enName: 'Chromium', mass: 51.996, period: 4, group: 6, category: 'transition-metal', electronConfig: '[Ar] 3d⁵ 4s¹', oxidationStates: '+6, +3, +2', reagentIds: [] },
    { number: 25, symbol: 'Mn', name: '锰', enName: 'Manganese', mass: 54.938, period: 4, group: 7, category: 'transition-metal', electronConfig: '[Ar] 3d⁵ 4s²', oxidationStates: '+7, +4, +2', reagentIds: ['KMnO4'] },
    { number: 26, symbol: 'Fe', name: '铁', enName: 'Iron', mass: 55.845, period: 4, group: 8, category: 'transition-metal', electronConfig: '[Ar] 3d⁶ 4s²', oxidationStates: '+3, +2', reagentIds: ['Fe', 'FeCl3', 'FeSO4'] },
    { number: 27, symbol: 'Co', name: '钴', enName: 'Cobalt', mass: 58.933, period: 4, group: 9, category: 'transition-metal', electronConfig: '[Ar] 3d⁷ 4s²', oxidationStates: '+3, +2', reagentIds: [] },
    { number: 28, symbol: 'Ni', name: '镍', enName: 'Nickel', mass: 58.693, period: 4, group: 10, category: 'transition-metal', electronConfig: '[Ar] 3d⁸ 4s²', oxidationStates: '+2, +3', reagentIds: [] },
    { number: 29, symbol: 'Cu', name: '铜', enName: 'Copper', mass: 63.546, period: 4, group: 11, category: 'transition-metal', electronConfig: '[Ar] 3d¹⁰ 4s¹', oxidationStates: '+2, +1', reagentIds: ['Cu', 'CuSO4'] },
    { number: 30, symbol: 'Zn', name: '锌', enName: 'Zinc', mass: 65.38, period: 4, group: 12, category: 'transition-metal', electronConfig: '[Ar] 3d¹⁰ 4s²', oxidationStates: '+2', reagentIds: ['Zn'] },
    { number: 31, symbol: 'Ga', name: '镓', enName: 'Gallium', mass: 69.723, period: 4, group: 13, category: 'post-transition', electronConfig: '[Ar] 3d¹⁰ 4s² 4p¹', oxidationStates: '+3', reagentIds: [] },
    { number: 32, symbol: 'Ge', name: '锗', enName: 'Germanium', mass: 72.630, period: 4, group: 14, category: 'metalloid', electronConfig: '[Ar] 3d¹⁰ 4s² 4p²', oxidationStates: '+4, +2', reagentIds: [] },
    { number: 33, symbol: 'As', name: '砷', enName: 'Arsenic', mass: 74.922, period: 4, group: 15, category: 'metalloid', electronConfig: '[Ar] 3d¹⁰ 4s² 4p³', oxidationStates: '+5, +3, -3', reagentIds: [] },
    { number: 34, symbol: 'Se', name: '硒', enName: 'Selenium', mass: 78.971, period: 4, group: 16, category: 'reactive-nonmetal', electronConfig: '[Ar] 3d¹⁰ 4s² 4p⁴', oxidationStates: '+6, +4, -2', reagentIds: [] },
    { number: 35, symbol: 'Br', name: '溴', enName: 'Bromine', mass: 79.904, period: 4, group: 17, category: 'reactive-nonmetal', electronConfig: '[Ar] 3d¹⁰ 4s² 4p⁵', oxidationStates: '+5, +1, -1', reagentIds: [] },
    { number: 36, symbol: 'Kr', name: '氪', enName: 'Krypton', mass: 83.798, period: 4, group: 18, category: 'noble-gas', electronConfig: '[Ar] 3d¹⁰ 4s² 4p⁶', oxidationStates: '0', reagentIds: [] },

    // Period 5
    { number: 37, symbol: 'Rb', name: '铷', enName: 'Rubidium', mass: 85.468, period: 5, group: 1, category: 'alkali-metal', electronConfig: '[Kr] 5s¹', oxidationStates: '+1', reagentIds: [] },
    { number: 38, symbol: 'Sr', name: '锶', enName: 'Strontium', mass: 87.62, period: 5, group: 2, category: 'alkaline-earth', electronConfig: '[Kr] 5s²', oxidationStates: '+2', reagentIds: [] },
    { number: 39, symbol: 'Y', name: '钇', enName: 'Yttrium', mass: 88.906, period: 5, group: 3, category: 'transition-metal', electronConfig: '[Kr] 4d¹ 5s²', oxidationStates: '+3', reagentIds: [] },
    { number: 40, symbol: 'Zr', name: '锆', enName: 'Zirconium', mass: 91.224, period: 5, group: 4, category: 'transition-metal', electronConfig: '[Kr] 4d² 5s²', oxidationStates: '+4', reagentIds: [] },
    { number: 41, symbol: 'Nb', name: '铌', enName: 'Niobium', mass: 92.906, period: 5, group: 5, category: 'transition-metal', electronConfig: '[Kr] 4d⁴ 5s¹', oxidationStates: '+5, +3', reagentIds: [] },
    { number: 42, symbol: 'Mo', name: '钼', enName: 'Molybdenum', mass: 95.95, period: 5, group: 6, category: 'transition-metal', electronConfig: '[Kr] 4d⁵ 5s¹', oxidationStates: '+6, +4', reagentIds: [] },
    { number: 43, symbol: 'Tc', name: '锝', enName: 'Technetium', mass: 98, period: 5, group: 7, category: 'transition-metal', electronConfig: '[Kr] 4d⁵ 5s²', oxidationStates: '+7, +4', reagentIds: [] },
    { number: 44, symbol: 'Ru', name: '钌', enName: 'Ruthenium', mass: 101.07, period: 5, group: 8, category: 'transition-metal', electronConfig: '[Kr] 4d⁷ 5s¹', oxidationStates: '+4, +3', reagentIds: [] },
    { number: 45, symbol: 'Rh', name: '铑', enName: 'Rhodium', mass: 102.91, period: 5, group: 9, category: 'transition-metal', electronConfig: '[Kr] 4d⁸ 5s¹', oxidationStates: '+3', reagentIds: [] },
    { number: 46, symbol: 'Pd', name: '钯', enName: 'Palladium', mass: 106.42, period: 5, group: 10, category: 'transition-metal', electronConfig: '[Kr] 4d¹⁰', oxidationStates: '+2, +4', reagentIds: [] },
    { number: 47, symbol: 'Ag', name: '银', enName: 'Silver', mass: 107.87, period: 5, group: 11, category: 'transition-metal', electronConfig: '[Kr] 4d¹⁰ 5s¹', oxidationStates: '+1', reagentIds: ['AgNO3'] },
    { number: 48, symbol: 'Cd', name: '镉', enName: 'Cadmium', mass: 112.41, period: 5, group: 12, category: 'transition-metal', electronConfig: '[Kr] 4d¹⁰ 5s²', oxidationStates: '+2', reagentIds: [] },
    { number: 49, symbol: 'In', name: '铟', enName: 'Indium', mass: 114.82, period: 5, group: 13, category: 'post-transition', electronConfig: '[Kr] 4d¹⁰ 5s² 5p¹', oxidationStates: '+3', reagentIds: [] },
    { number: 50, symbol: 'Sn', name: '锡', enName: 'Tin', mass: 118.71, period: 5, group: 14, category: 'post-transition', electronConfig: '[Kr] 4d¹⁰ 5s² 5p²', oxidationStates: '+4, +2', reagentIds: [] },
    { number: 51, symbol: 'Sb', name: '锑', enName: 'Antimony', mass: 121.76, period: 5, group: 15, category: 'metalloid', electronConfig: '[Kr] 4d¹⁰ 5s² 5p³', oxidationStates: '+5, +3, -3', reagentIds: [] },
    { number: 52, symbol: 'Te', name: '碲', enName: 'Tellurium', mass: 127.60, period: 5, group: 16, category: 'metalloid', electronConfig: '[Kr] 4d¹⁰ 5s² 5p⁴', oxidationStates: '+6, +4, -2', reagentIds: [] },
    { number: 53, symbol: 'I', name: '碘', enName: 'Iodine', mass: 126.90, period: 5, group: 17, category: 'reactive-nonmetal', electronConfig: '[Kr] 4d¹⁰ 5s² 5p⁵', oxidationStates: '+7, +5, -1', reagentIds: [] },
    { number: 54, symbol: 'Xe', name: '氙', enName: 'Xenon', mass: 131.29, period: 5, group: 18, category: 'noble-gas', electronConfig: '[Kr] 4d¹⁰ 5s² 5p⁶', oxidationStates: '0, +2, +4, +6', reagentIds: [] },

    // Period 6
    { number: 55, symbol: 'Cs', name: '铯', enName: 'Caesium', mass: 132.91, period: 6, group: 1, category: 'alkali-metal', electronConfig: '[Xe] 6s¹', oxidationStates: '+1', reagentIds: [] },
    { number: 56, symbol: 'Ba', name: '钡', enName: 'Barium', mass: 137.33, period: 6, group: 2, category: 'alkaline-earth', electronConfig: '[Xe] 6s²', oxidationStates: '+2', reagentIds: ['BaCl2'] },

    // Lanthanides (57 - 71)
    { number: 57, symbol: 'La', name: '镧', enName: 'Lanthanum', mass: 138.91, period: 8, group: 3, category: 'lanthanide', electronConfig: '[Xe] 5d¹ 6s²', oxidationStates: '+3', reagentIds: [] },
    { number: 58, symbol: 'Ce', name: '铈', enName: 'Cerium', mass: 140.12, period: 8, group: 4, category: 'lanthanide', electronConfig: '[Xe] 4f¹ 5d¹ 6s²', oxidationStates: '+4, +3', reagentIds: [] },
    { number: 59, symbol: 'Pr', name: '镨', enName: 'Praseodymium', mass: 140.91, period: 8, group: 5, category: 'lanthanide', electronConfig: '[Xe] 4f³ 6s²', oxidationStates: '+3', reagentIds: [] },
    { number: 60, symbol: 'Nd', name: '钕', enName: 'Neodymium', mass: 144.24, period: 8, group: 6, category: 'lanthanide', electronConfig: '[Xe] 4f⁴ 6s²', oxidationStates: '+3', reagentIds: [] },
    { number: 61, symbol: 'Pm', name: '钷', enName: 'Promethium', mass: 145, period: 8, group: 7, category: 'lanthanide', electronConfig: '[Xe] 4f⁵ 6s²', oxidationStates: '+3', reagentIds: [] },
    { number: 62, symbol: 'Sm', name: '钐', enName: 'Samarium', mass: 150.36, period: 8, group: 8, category: 'lanthanide', electronConfig: '[Xe] 4f⁶ 6s²', oxidationStates: '+3, +2', reagentIds: [] },
    { number: 63, symbol: 'Eu', name: '铕', enName: 'Europium', mass: 151.96, period: 8, group: 9, category: 'lanthanide', electronConfig: '[Xe] 4f⁷ 6s²', oxidationStates: '+3, +2', reagentIds: [] },
    { number: 64, symbol: 'Gd', name: '钆', enName: 'Gadolinium', mass: 157.25, period: 8, group: 10, category: 'lanthanide', electronConfig: '[Xe] 4f⁷ 5d¹ 6s²', oxidationStates: '+3', reagentIds: [] },
    { number: 65, symbol: 'Tb', name: '铽', enName: 'Terbium', mass: 158.93, period: 8, group: 11, category: 'lanthanide', electronConfig: '[Xe] 4f⁹ 6s²', oxidationStates: '+3, +4', reagentIds: [] },
    { number: 66, symbol: 'Dy', name: '镝', enName: 'Dysprosium', mass: 162.50, period: 8, group: 12, category: 'lanthanide', electronConfig: '[Xe] 4f¹⁰ 6s²', oxidationStates: '+3', reagentIds: [] },
    { number: 67, symbol: 'Ho', name: '钬', enName: 'Holmium', mass: 164.93, period: 8, group: 13, category: 'lanthanide', electronConfig: '[Xe] 4f¹¹ 6s²', oxidationStates: '+3', reagentIds: [] },
    { number: 68, symbol: 'Er', name: '铒', enName: 'Erbium', mass: 167.26, period: 8, group: 14, category: 'lanthanide', electronConfig: '[Xe] 4f¹² 6s²', oxidationStates: '+3', reagentIds: [] },
    { number: 69, symbol: 'Tm', name: '铥', enName: 'Thulium', mass: 168.93, period: 8, group: 15, category: 'lanthanide', electronConfig: '[Xe] 4f¹³ 6s²', oxidationStates: '+3', reagentIds: [] },
    { number: 70, symbol: 'Yb', name: '镱', enName: 'Ytterbium', mass: 173.05, period: 8, group: 16, category: 'lanthanide', electronConfig: '[Xe] 4f¹⁴ 6s²', oxidationStates: '+3, +2', reagentIds: [] },
    { number: 71, symbol: 'Lu', name: '镥', enName: 'Lutetium', mass: 174.97, period: 8, group: 17, category: 'lanthanide', electronConfig: '[Xe] 4f¹⁴ 5d¹ 6s²', oxidationStates: '+3', reagentIds: [] },

    // Period 6 (continued)
    { number: 72, symbol: 'Hf', name: '铪', enName: 'Hafnium', mass: 178.49, period: 6, group: 4, category: 'transition-metal', electronConfig: '[Xe] 4f¹⁴ 5d² 6s²', oxidationStates: '+4', reagentIds: [] },
    { number: 73, symbol: 'Ta', name: '钽', enName: 'Tantalum', mass: 180.95, period: 6, group: 5, category: 'transition-metal', electronConfig: '[Xe] 4f¹⁴ 5d³ 6s²', oxidationStates: '+5', reagentIds: [] },
    { number: 74, symbol: 'W', name: '钨', enName: 'Tungsten', mass: 183.84, period: 6, group: 6, category: 'transition-metal', electronConfig: '[Xe] 4f¹⁴ 5d⁴ 6s²', oxidationStates: '+6, +4', reagentIds: [] },
    { number: 75, symbol: 'Re', name: '铼', enName: 'Rhenium', mass: 186.21, period: 6, group: 7, category: 'transition-metal', electronConfig: '[Xe] 4f¹⁴ 5d⁵ 6s²', oxidationStates: '+7, +4', reagentIds: [] },
    { number: 76, symbol: 'Os', name: '锇', enName: 'Osmium', mass: 190.23, period: 6, group: 8, category: 'transition-metal', electronConfig: '[Xe] 4f¹⁴ 5d⁶ 6s²', oxidationStates: '+4, +8', reagentIds: [] },
    { number: 77, symbol: 'Ir', name: '铱', enName: 'Iridium', mass: 192.22, period: 6, group: 9, category: 'transition-metal', electronConfig: '[Xe] 4f¹⁴ 5d⁷ 6s²', oxidationStates: '+4, +3', reagentIds: [] },
    { number: 78, symbol: 'Pt', name: '铂', enName: 'Platinum', mass: 195.08, period: 6, group: 10, category: 'transition-metal', electronConfig: '[Xe] 4f¹⁴ 5d⁹ 6s¹', oxidationStates: '+4, +2', reagentIds: [] },
    { number: 79, symbol: 'Au', name: '金', enName: 'Gold', mass: 196.97, period: 6, group: 11, category: 'transition-metal', electronConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s¹', oxidationStates: '+3, +1', reagentIds: [] },
    { number: 80, symbol: 'Hg', name: '汞', enName: 'Mercury', mass: 200.59, period: 6, group: 12, category: 'transition-metal', electronConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s²', oxidationStates: '+2, +1', reagentIds: [] },
    { number: 81, symbol: 'Tl', name: '铊', enName: 'Thallium', mass: 204.38, period: 6, group: 13, category: 'post-transition', electronConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p¹', oxidationStates: '+1, +3', reagentIds: [] },
    { number: 82, symbol: 'Pb', name: '铅', enName: 'Lead', mass: 207.2, period: 6, group: 14, category: 'post-transition', electronConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²', oxidationStates: '+2, +4', reagentIds: [] },
    { number: 83, symbol: 'Bi', name: '铋', enName: 'Bismuth', mass: 208.98, period: 6, group: 15, category: 'post-transition', electronConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p³', oxidationStates: '+3', reagentIds: [] },
    { number: 84, symbol: 'Po', name: '钋', enName: 'Polonium', mass: 209, period: 6, group: 16, category: 'post-transition', electronConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁴', oxidationStates: '+4, +2', reagentIds: [] },
    { number: 85, symbol: 'At', name: '砹', enName: 'Astatine', mass: 210, period: 6, group: 17, category: 'metalloid', electronConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁵', oxidationStates: '-1, +1', reagentIds: [] },
    { number: 86, symbol: 'Rn', name: '氡', enName: 'Radon', mass: 222, period: 6, group: 18, category: 'noble-gas', electronConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁶', oxidationStates: '0', reagentIds: [] },

    // Period 7
    { number: 87, symbol: 'Fr', name: '钫', enName: 'Francium', mass: 223, period: 7, group: 1, category: 'alkali-metal', electronConfig: '[Rn] 7s¹', oxidationStates: '+1', reagentIds: [] },
    { number: 88, symbol: 'Ra', name: '镭', enName: 'Radium', mass: 226, period: 7, group: 2, category: 'alkaline-earth', electronConfig: '[Rn] 7s²', oxidationStates: '+2', reagentIds: [] },

    // Actinides (89 - 103)
    { number: 89, symbol: 'Ac', name: '锕', enName: 'Actinium', mass: 227, period: 9, group: 3, category: 'actinide', electronConfig: '[Rn] 6d¹ 7s²', oxidationStates: '+3', reagentIds: [] },
    { number: 90, symbol: 'Th', name: '钍', enName: 'Thorium', mass: 232.04, period: 9, group: 4, category: 'actinide', electronConfig: '[Rn] 6d² 7s²', oxidationStates: '+4', reagentIds: [] },
    { number: 91, symbol: 'Pa', name: '镤', enName: 'Protactinium', mass: 231.04, period: 9, group: 5, category: 'actinide', electronConfig: '[Rn] 5f² 6d¹ 7s²', oxidationStates: '+5, +4', reagentIds: [] },
    { number: 92, symbol: 'U', name: '铀', enName: 'Uranium', mass: 238.03, period: 9, group: 6, category: 'actinide', electronConfig: '[Rn] 5f³ 6d¹ 7s²', oxidationStates: '+6, +4', reagentIds: [] },
    { number: 93, symbol: 'Np', name: '镎', enName: 'Neptunium', mass: 237, period: 9, group: 7, category: 'actinide', electronConfig: '[Rn] 5f⁴ 6d¹ 7s²', oxidationStates: '+5, +4', reagentIds: [] },
    { number: 94, symbol: 'Pu', name: '钚', enName: 'Plutonium', mass: 244, period: 9, group: 8, category: 'actinide', electronConfig: '[Rn] 5f⁶ 7s²', oxidationStates: '+4, +3', reagentIds: [] },
    { number: 95, symbol: 'Am', name: '镅', enName: 'Americium', mass: 243, period: 9, group: 9, category: 'actinide', electronConfig: '[Rn] 5f⁷ 7s²', oxidationStates: '+3, +4', reagentIds: [] },
    { number: 96, symbol: 'Cm', name: '锔', enName: 'Curium', mass: 247, period: 9, group: 10, category: 'actinide', electronConfig: '[Rn] 5f⁷ 6d¹ 7s²', oxidationStates: '+3', reagentIds: [] },
    { number: 97, symbol: 'Bk', name: '锫', enName: 'Berkelium', mass: 247, period: 9, group: 11, category: 'actinide', electronConfig: '[Rn] 5f⁹ 7s²', oxidationStates: '+3, +4', reagentIds: [] },
    { number: 98, symbol: 'Cf', name: '锎', enName: 'Californium', mass: 251, period: 9, group: 12, category: 'actinide', electronConfig: '[Rn] 5f¹⁰ 7s²', oxidationStates: '+3', reagentIds: [] },
    { number: 99, symbol: 'Es', name: '锿', enName: 'Einsteinium', mass: 252, period: 9, group: 13, category: 'actinide', electronConfig: '[Rn] 5f¹¹ 7s²', oxidationStates: '+3', reagentIds: [] },
    { number: 100, symbol: 'Fm', name: '镄', enName: 'Fermium', mass: 257, period: 9, group: 14, category: 'actinide', electronConfig: '[Rn] 5f¹² 7s²', oxidationStates: '+3', reagentIds: [] },
    { number: 101, symbol: 'Md', name: '钔', enName: 'Mendelevium', mass: 258, period: 9, group: 15, category: 'actinide', electronConfig: '[Rn] 5f¹³ 7s²', oxidationStates: '+3, +2', reagentIds: [] },
    { number: 102, symbol: 'No', name: '锘', enName: 'Nobelium', mass: 259, period: 9, group: 16, category: 'actinide', electronConfig: '[Rn] 5f¹⁴ 7s²', oxidationStates: '+2, +3', reagentIds: [] },
    { number: 103, symbol: 'Lr', name: '铹', enName: 'Lawrencium', mass: 266, period: 9, group: 17, category: 'actinide', electronConfig: '[Rn] 5f¹⁴ 7s² 7p¹', oxidationStates: '+3', reagentIds: [] },

    // Period 7 (continued, 104 - 118)
    { number: 104, symbol: 'Rf', name: '𬬻', enName: 'Rutherfordium', mass: 267, period: 7, group: 4, category: 'transition-metal', electronConfig: '[Rn] 5f¹⁴ 6d² 7s²', oxidationStates: '+4', reagentIds: [] },
    { number: 105, symbol: 'Db', name: '𬭊', enName: 'Dubnium', mass: 268, period: 7, group: 5, category: 'transition-metal', electronConfig: '[Rn] 5f¹⁴ 6d³ 7s²', oxidationStates: '+5', reagentIds: [] },
    { number: 106, symbol: 'Sg', name: '𬭳', enName: 'Seaborgium', mass: 269, period: 7, group: 6, category: 'transition-metal', electronConfig: '[Rn] 5f¹⁴ 6d⁴ 7s²', oxidationStates: '+6', reagentIds: [] },
    { number: 107, symbol: 'Bh', name: '𬭛', enName: 'Bohrium', mass: 270, period: 7, group: 7, category: 'transition-metal', electronConfig: '[Rn] 5f¹⁴ 6d⁵ 7s²', oxidationStates: '+7', reagentIds: [] },
    { number: 108, symbol: 'Hs', name: '𬭶', enName: 'Hassium', mass: 277, period: 7, group: 8, category: 'transition-metal', electronConfig: '[Rn] 5f¹⁴ 6d⁶ 7s²', oxidationStates: '+8', reagentIds: [] },
    { number: 109, symbol: 'Mt', name: '鿏', enName: 'Meitnerium', mass: 278, period: 7, group: 9, category: 'transition-metal', electronConfig: '[Rn] 5f¹⁴ 6d⁷ 7s²', oxidationStates: '+9', reagentIds: [] },
    { number: 110, symbol: 'Ds', name: '𫟼', enName: 'Darmstadtium', mass: 281, period: 7, group: 10, category: 'transition-metal', electronConfig: '[Rn] 5f¹⁴ 6d⁸ 7s²', oxidationStates: '+8', reagentIds: [] },
    { number: 111, symbol: 'Rg', name: '𬬭', enName: 'Roentgenium', mass: 282, period: 7, group: 11, category: 'transition-metal', electronConfig: '[Rn] 5f¹⁴ 6d⁹ 7s²', oxidationStates: '+3', reagentIds: [] },
    { number: 112, symbol: 'Cn', name: '鎶', enName: 'Copernicium', mass: 285, period: 7, group: 12, category: 'transition-metal', electronConfig: '[Rn] 5f¹⁴ 6d¹⁰ 7s²', oxidationStates: '+2', reagentIds: [] },
    { number: 113, symbol: 'Nh', name: '鿭', enName: 'Nihonium', mass: 286, period: 7, group: 13, category: 'post-transition', electronConfig: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p¹', oxidationStates: '+1', reagentIds: [] },
    { number: 114, symbol: 'Fl', name: '𫓧', enName: 'Flerovium', mass: 289, period: 7, group: 14, category: 'post-transition', electronConfig: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p²', oxidationStates: '+2', reagentIds: [] },
    { number: 115, symbol: 'Mc', name: '镆', enName: 'Moscovium', mass: 290, period: 7, group: 15, category: 'post-transition', electronConfig: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p³', oxidationStates: '+1, +3', reagentIds: [] },
    { number: 116, symbol: 'Lv', name: '𫟷', enName: 'Livermorium', mass: 293, period: 7, group: 16, category: 'post-transition', electronConfig: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁴', oxidationStates: '+2', reagentIds: [] },
    { number: 117, symbol: 'Ts', name: '鿬', enName: 'Tennessine', mass: 294, period: 7, group: 17, category: 'reactive-nonmetal', electronConfig: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁵', oxidationStates: '-1', reagentIds: [] },
    { number: 118, symbol: 'Og', name: '鿫', enName: 'Oganesson', mass: 294, period: 7, group: 18, category: 'noble-gas', electronConfig: '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁶', oxidationStates: '0', reagentIds: [] },
  ];

  /**
   * Layout configuration mapping atomic numbers of common elements to their 18-column x 5-row periodic positions.
   * Maintains exact chemical group (column) and periodic group alignment:
   * - Col 1: Alkali Metals (H, Li, Na, K)
   * - Col 2: Alkaline Earth Metals (Be, Mg, Ca, Ba)
   * - Col 7: Mn
   * - Col 8: Fe
   * - Col 11: Coinage Metals (Cu, Ag)
   * - Col 12: Zn
   * - Col 13: Boron & Aluminium (B, Al)
   * - Col 14: Carbon Group (C, Si)
   * - Col 15: Nitrogen Group (N, P)
   * - Col 16: Chalcogens (O, S)
   * - Col 17: Halogens (F, Cl, Br, I)
   * - Col 18: Noble Gases (He, Ne, Ar)
   */
  public static readonly COMMON_ELEMENT_LAYOUT: Record<number, { row: number; col: number }> = {
    // Period 1
    1: { row: 1, col: 1 },    // H
    2: { row: 1, col: 18 },   // He

    // Period 2
    3: { row: 2, col: 1 },    // Li
    4: { row: 2, col: 2 },    // Be
    5: { row: 2, col: 13 },   // B
    6: { row: 2, col: 14 },   // C
    7: { row: 2, col: 15 },   // N
    8: { row: 2, col: 16 },   // O
    9: { row: 2, col: 17 },   // F
    10: { row: 2, col: 18 },  // Ne

    // Period 3
    11: { row: 3, col: 1 },   // Na
    12: { row: 3, col: 2 },   // Mg
    13: { row: 3, col: 13 },  // Al
    14: { row: 3, col: 14 },  // Si
    15: { row: 3, col: 15 },  // P
    16: { row: 3, col: 16 },  // S
    17: { row: 3, col: 17 },  // Cl
    18: { row: 3, col: 18 },  // Ar

    // Period 4
    19: { row: 4, col: 1 },   // K
    20: { row: 4, col: 2 },   // Ca
    25: { row: 4, col: 7 },   // Mn
    26: { row: 4, col: 8 },   // Fe
    29: { row: 4, col: 11 },  // Cu
    30: { row: 4, col: 12 },  // Zn
    35: { row: 4, col: 17 },  // Br

    // Period 5 & 6 (Common Lab Elements aligned vertically with their chemical family)
    56: { row: 5, col: 2 },   // Ba (Alkaline Earth: Be -> Mg -> Ca -> Ba)
    47: { row: 5, col: 11 },  // Ag (Coinage Metals: Cu -> Ag)
    53: { row: 5, col: 17 },  // I  (Halogens: F -> Cl -> Br -> I)
  };

  private engine: ChemistryEngine;
  private onBackToDisciplines: () => void;
  private onViewBeaker?: () => void;
  private selectedElement: PeriodicElement;
  private toastTimeout: number | null = null;

  constructor(
    engine: ChemistryEngine,
    onBackToDisciplines: () => void,
    onViewBeaker?: () => void
  ) {
    this.engine = engine;
    this.onBackToDisciplines = onBackToDisciplines;
    this.onViewBeaker = onViewBeaker;
    this.selectedElement = PeriodicTableModal.ELEMENTS.find((e) => e.symbol === 'Na') || PeriodicTableModal.ELEMENTS[0];
    this.createUI();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-periodic-container';

    this.element.innerHTML = `
      <!-- Pure Minimalist Periodic Grid (Common Elements Only) -->
      <div class="periodic-grid" id="periodic-elements-grid"></div>

      <!-- Apple Contextual Popover Card -->
      <div class="element-popover-overlay hidden" id="element-popover-overlay">
        <div class="element-popover-card" id="element-popover-card"></div>
      </div>

      <!-- Apple Minimalist Toast -->
      <div class="vision-hud-toast hidden" id="vision-hud-toast">
        <span class="toast-text" id="toast-text"></span>
      </div>
    `;

    this.renderGrid();
    this.bindEvents();
  }

  private renderGrid(): void {
    const mainGrid = this.element.querySelector('#periodic-elements-grid') as HTMLElement;
    if (!mainGrid) return;

    mainGrid.innerHTML = '';

    // Render 28 common elements with exact periodic group and period alignment
    for (const [numStr, pos] of Object.entries(PeriodicTableModal.COMMON_ELEMENT_LAYOUT)) {
      const num = parseInt(numStr, 10);
      const elem = PeriodicTableModal.ELEMENTS.find((e) => e.number === num);
      if (!elem) continue;

      const card = document.createElement('div');
      card.className = `element-cell cat-${elem.category}`;
      card.dataset.num = elem.number.toString();
      card.style.gridRow = pos.row.toString();
      card.style.gridColumn = pos.col.toString();

      card.innerHTML = `
        <span class="elem-num">${elem.number}</span>
        <span class="elem-sym">${elem.symbol}</span>
        <span class="elem-name">${elem.name}</span>
      `;

      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openElementPopover(elem);
      });

      mainGrid.appendChild(card);
    }
  }

  public selectElement(elem: PeriodicElement): void {
    this.openElementPopover(elem);
  }

  public openElementPopover(elem: PeriodicElement): void {
    this.selectedElement = elem;
    const overlay = this.element.querySelector('#element-popover-overlay') as HTMLElement;
    const card = this.element.querySelector('#element-popover-card') as HTMLElement;
    if (!overlay || !card) return;

    // Highlight selected cell
    this.element.querySelectorAll('.element-cell').forEach((c) => {
      const isSelected = (c as HTMLElement).dataset.num === elem.number.toString();
      c.classList.toggle('selected', isSelected);
    });

    const reagents = elem.reagentIds.map((id) => ChemistryEngine.REAGENTS[id]).filter(Boolean);

    card.innerHTML = `
      <div class="popover-header">
        <div class="popover-title-row">
          <span class="popover-sym">${elem.symbol}</span>
          <div class="popover-title-text">
            <div class="popover-names">
              <span class="popover-cn">${elem.name}</span>
              <span class="popover-en">${elem.enName}</span>
            </div>
            <div class="popover-meta">
              <span>No. ${elem.number}</span>
              <span>·</span>
              <span>${this.getCategoryLabel(elem.category)}</span>
            </div>
          </div>
        </div>
        <button class="popover-close-btn" id="btn-popover-close" title="关闭 (ESC)">✕</button>
      </div>

      ${
        reagents.length > 0
          ? `
          <div class="popover-reagents-list">
            ${reagents
              .map((r) => {
                const isSolid = r.state === 'solid';
                return `
                <button class="popover-reagent-row" data-reagent-id="${r.id}">
                  <span class="reagent-row-name">${r.name}</span>
                  <span class="reagent-row-action">${isSolid ? '投入' : '注入'} ${r.defaultAmount}${r.unit}</span>
                </button>
              `;
              })
              .join('')}
          </div>
          `
          : `
          <div class="popover-element-meta">
            <div class="meta-row">
              <span class="meta-label">外层电子</span>
              <span class="meta-value font-mono">${elem.electronConfig}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">常见化合价</span>
              <span class="meta-value font-mono">${elem.oxidationStates}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">原子量</span>
              <span class="meta-value font-mono">${elem.mass} u</span>
            </div>
          </div>
          `
      }
    `;

    // Bind reagent buttons
    reagents.forEach((r) => {
      const btn = card.querySelector(`.popover-reagent-row[data-reagent-id="${r.id}"]`);
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.engine.addReagent(r.id, r.defaultAmount);

        btn.classList.add('row-added');
        const actionSpan = btn.querySelector('.reagent-row-action');
        const origText = actionSpan?.textContent || '';
        if (actionSpan) actionSpan.textContent = '✓ 已加入';

        this.showToast(`已加入 ${r.name}`);

        setTimeout(() => {
          btn.classList.remove('row-added');
          if (actionSpan) actionSpan.textContent = origText;
        }, 800);
      });
    });

    // Close button
    card.querySelector('#btn-popover-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeElementPopover();
    });

    overlay.classList.remove('hidden');
  }

  public closeElementPopover(): void {
    const overlay = this.element.querySelector('#element-popover-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
    this.element.querySelectorAll('.element-cell').forEach((c) => {
      c.classList.remove('selected');
    });
  }

  public showToast(message: string): void {
    const toast = this.element.querySelector('#vision-hud-toast') as HTMLElement;
    const textEl = this.element.querySelector('#toast-text') as HTMLElement;
    if (!toast || !textEl) return;

    textEl.textContent = message;
    toast.classList.remove('hidden');

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    this.toastTimeout = window.setTimeout(() => {
      toast.classList.add('hidden');
    }, 2200);
  }

  private getCategoryLabel(cat: PeriodicElement['category']): string {
    switch (cat) {
      case 'alkali-metal':
        return '碱金属';
      case 'alkaline-earth':
        return '碱土金属';
      case 'transition-metal':
        return '过渡金属';
      case 'post-transition':
        return '后过渡金属';
      case 'metalloid':
        return '类金属';
      case 'reactive-nonmetal':
        return '非金属';
      case 'noble-gas':
        return '稀有气体';
      case 'lanthanide':
        return '镧系';
      case 'actinide':
        return '锕系';
      default:
        return '元素';
    }
  }

  private bindEvents(): void {
    // Overlay backdrop click dismisses popover
    const overlay = this.element.querySelector('#element-popover-overlay');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeElementPopover();
      }
    });

    // Global escape key to dismiss popover
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.closeElementPopover();
      }
    });
  }
}


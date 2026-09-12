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
  private selectedElement: PeriodicElement;
  private activeCategoryFilter = 'all';
  private reagentAmounts = new Map<string, number>();

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

  private engine: ChemistryEngine;
  private onBackToDisciplines: () => void;
  private onViewBeaker?: () => void;

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
      <div class="periodic-top-controls">
        <div class="top-controls-left">
          <button class="vision-back-btn" id="btn-back-disciplines">
            <span class="back-icon">←</span>
            <span>学科大厅</span>
          </button>
          <div class="periodic-title-pill">
            <span class="pill-text">元素周期表</span>
          </div>
          ${
            this.onViewBeaker
              ? `
          <button class="vision-back-btn vision-view-beaker-btn" id="btn-quick-beaker">
            <span>烧杯监控</span>
            <span class="back-icon">→</span>
          </button>
          `
              : ''
          }
        </div>

        <div class="periodic-filter-bar" id="category-filter-bar">
          <button class="category-tab active" data-cat="all">全部 (118)</button>
          <button class="category-tab cat-alkali" data-cat="alkali-metal">碱金属</button>
          <button class="category-tab cat-alkaline" data-cat="alkaline-earth">碱土金属</button>
          <button class="category-tab cat-trans" data-cat="transition-metal">过渡金属</button>
          <button class="category-tab cat-post" data-cat="post-transition">后过渡金属</button>
          <button class="category-tab cat-metalloid" data-cat="metalloid">类金属</button>
          <button class="category-tab cat-nonmetal" data-cat="reactive-nonmetal">非金属</button>
          <button class="category-tab cat-noble" data-cat="noble-gas">稀有气体</button>
          <button class="category-tab cat-lanth" data-cat="lanthanide">镧/锕系</button>
        </div>
      </div>

      <!-- Main Layout: Periodic Grid on Left, Element Detail & Reagent Drawer on Right -->
      <div class="periodic-layout-split">
        <!-- Periodic Table Grid -->
        <div class="periodic-grid-wrapper">
          <div class="periodic-grid" id="periodic-elements-grid"></div>

          <!-- Bottom Separated Lanthanides and Actinides -->
          <div class="lanth-act-separator">
            <span class="lanth-label">镧系元素 (57-71)</span>
            <span class="act-label">锕系元素 (89-103)</span>
          </div>
          <div class="lanth-act-grid" id="lanth-act-grid"></div>
        </div>

        <!-- Right Side: Element Detail & Reagents Drawer -->
        <div class="element-drawer" id="element-drawer">
          <!-- Will be rendered dynamically -->
        </div>
      </div>
    `;

    this.renderGrid();
    this.renderElementDrawer();
    this.bindEvents();
  }

  private renderGrid(): void {
    const mainGrid = this.element.querySelector('#periodic-elements-grid') as HTMLElement;
    const lanthActGrid = this.element.querySelector('#lanth-act-grid') as HTMLElement;

    if (!mainGrid || !lanthActGrid) return;

    mainGrid.innerHTML = '';
    lanthActGrid.innerHTML = '';

    // Render 118 elements
    for (const elem of PeriodicTableModal.ELEMENTS) {
      const isLanthAct = elem.period >= 8;
      const card = document.createElement('div');
      card.className = `element-cell cat-${elem.category} ${elem.number === this.selectedElement.number ? 'selected' : ''}`;
      card.dataset.num = elem.number.toString();
      card.dataset.cat = elem.category;

      if (!isLanthAct) {
        card.style.gridColumn = elem.group.toString();
        card.style.gridRow = elem.period.toString();
        mainGrid.appendChild(card);
      } else {
        const subRow = elem.period === 8 ? 1 : 2;
        const subCol = elem.group - 2; // Col 1 to 15
        card.style.gridRow = subRow.toString();
        card.style.gridColumn = subCol.toString();
        lanthActGrid.appendChild(card);
      }

      card.innerHTML = `
        <span class="elem-num">${elem.number}</span>
        <span class="elem-sym">${elem.symbol}</span>
        <span class="elem-name">${elem.name}</span>
        <span class="elem-mass">${elem.mass.toFixed(elem.mass > 100 ? 1 : 2)}</span>
      `;

      card.addEventListener('click', () => {
        this.selectElement(elem);
      });
    }
  }

  public selectElement(elem: PeriodicElement): void {
    this.selectedElement = elem;

    // Update cell highlights
    const allCells = this.element.querySelectorAll('.element-cell');
    allCells.forEach((c) => {
      if ((c as HTMLElement).dataset.num === elem.number.toString()) {
        c.classList.add('selected');
      } else {
        c.classList.remove('selected');
      }
    });

    this.renderElementDrawer();
  }

  private renderElementDrawer(): void {
    const drawer = this.element.querySelector('#element-drawer');
    if (!drawer) return;

    const elem = this.selectedElement;
    const reagents = elem.reagentIds.map((id) => ChemistryEngine.REAGENTS[id]).filter(Boolean);

    drawer.innerHTML = `
      <div class="drawer-inner-card">
        <!-- Giant Element Showcase -->
        <div class="elem-showcase-header cat-${elem.category}">
          <div class="showcase-top">
            <span class="showcase-num">No. ${elem.number}</span>
            <span class="showcase-category-badge">${this.getCategoryLabel(elem.category)}</span>
          </div>
          <div class="showcase-main-row">
            <span class="showcase-symbol">${elem.symbol}</span>
            <div class="showcase-name-col">
              <span class="showcase-cn-name">${elem.name}</span>
              <span class="showcase-en-name">${elem.enName}</span>
              <span class="showcase-mass">${elem.mass} u</span>
            </div>
          </div>
          <div class="showcase-props-grid">
            <div class="prop-item">
              <span class="p-label">外层电子排布</span>
              <span class="p-val font-mono">${elem.electronConfig}</span>
            </div>
            <div class="prop-item">
              <span class="p-label">常见化合价态</span>
              <span class="p-val font-mono">${elem.oxidationStates}</span>
            </div>
          </div>
        </div>

        <!-- Reagents Section -->
        <div class="drawer-reagents-section">
          <div class="reagents-section-header">
            <span class="r-title">实验室常见试剂与化合物 (${reagents.length})</span>
            <span class="r-subtitle">可直接添加至桌上烧杯反应</span>
          </div>

          <div class="reagents-cards-list">
            ${
              reagents.length > 0
                ? reagents.map((r) => this.renderReagentCard(r)).join('')
                : `
                <div class="no-specific-reagents">
                  <div class="no-r-text">该元素暂无预装离子标样试剂</div>
                  <button class="add-custom-sample-btn" id="btn-add-pure-sample">
                    <span>注入高纯标样 (${elem.name}) 50mL</span>
                  </button>
                </div>
                `
            }
          </div>

          <!-- Quick Indicators Toolbelt -->
          <div class="quick-indicators-belt">
            <span class="belt-label">滴加酸碱指示剂：</span>
            <div class="belt-buttons">
              <button class="indicator-btn btn-phenolphthalein" id="quick-add-phenolphthalein">
                <span>酚酞指示剂 (5滴)</span>
              </button>
              <button class="indicator-btn btn-litmus" id="quick-add-litmus">
                <span>石蕊指示剂 (5滴)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind reagent buttons, stepper and presets inside drawer
    reagents.forEach((r) => {
      const isSolid = r.state === 'solid';
      const minVal = isSolid ? 1 : 5;
      const maxVal = isSolid ? 5 : 100;
      const stepVal = isSolid ? 1 : 5;

      const updateAmountDisplay = (newVal: number) => {
        const clamped = Math.max(minVal, Math.min(maxVal, newVal));
        this.reagentAmounts.set(r.id, clamped);

        const valEl = drawer.querySelector(`#amount-val-${r.id}`);
        if (valEl) valEl.textContent = `${clamped} ${r.unit}`;

        const btnAmtEl = drawer.querySelector(`#btn-amt-label-${r.id}`);
        if (btnAmtEl) btnAmtEl.textContent = `${clamped} ${r.unit}`;

        // Toggle active preset
        drawer.querySelectorAll(`.amount-preset-chip[data-id="${r.id}"]`).forEach((chip) => {
          const chipVal = Number((chip as HTMLElement).dataset.val);
          chip.classList.toggle('active', chipVal === clamped);
        });
      };

      // Minus button
      drawer.querySelector(`.btn-minus[data-id="${r.id}"]`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = this.reagentAmounts.get(r.id) ?? r.defaultAmount;
        updateAmountDisplay(cur - stepVal);
      });

      // Plus button
      drawer.querySelector(`.btn-plus[data-id="${r.id}"]`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = this.reagentAmounts.get(r.id) ?? r.defaultAmount;
        updateAmountDisplay(cur + stepVal);
      });

      // Presets
      drawer.querySelectorAll(`.amount-preset-chip[data-id="${r.id}"]`).forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetVal = Number((chip as HTMLElement).dataset.val);
          updateAmountDisplay(targetVal);
        });
      });

      // Add to beaker button
      const btn = drawer.querySelector(`#btn-add-reagent-${r.id}`);
      btn?.addEventListener('click', () => {
        const chosenAmt = this.reagentAmounts.get(r.id) ?? r.defaultAmount;
        this.engine.addReagent(r.id, chosenAmt);

        // Tactile animation
        btn.classList.add('btn-added-flash');
        const iconSpan = btn.querySelector('.add-icon');
        const originalText = iconSpan?.textContent;
        if (iconSpan) iconSpan.textContent = '✓ 已加入';

        setTimeout(() => {
          btn.classList.remove('btn-added-flash');
          if (iconSpan && originalText) iconSpan.textContent = originalText;
        }, 650);
      });
    });

    // Custom sample
    drawer.querySelector('#btn-add-pure-sample')?.addEventListener('click', () => {
      this.engine.addReagent('H2O', 50);
    });

    // Quick indicators
    drawer.querySelector('#quick-add-phenolphthalein')?.addEventListener('click', () => {
      this.engine.addReagent('phenolphthalein');
    });

    drawer.querySelector('#quick-add-litmus')?.addEventListener('click', () => {
      this.engine.addReagent('litmus');
    });
  }

  private renderReagentCard(r: ChemicalReagent): string {
    const isSolid = r.state === 'solid';
    const currentAmount = this.reagentAmounts.get(r.id) ?? r.defaultAmount;
    const hexStr = `#${r.color.toString(16).padStart(6, '0')}`;
    const presets = isSolid ? [1, 2, 3] : [10, 25, 50];

    return `
      <div class="reagent-item-card" data-reagent-id="${r.id}">
        <div class="reagent-color-strip" style="background-color: ${hexStr};"></div>
        <div class="reagent-info-col">
          <div class="reagent-top-row">
            <span class="reagent-formula font-mono">${r.formula}</span>
            <span class="reagent-name">${r.name}</span>
            ${r.hazard ? `<span class="reagent-hazard-badge">${r.hazard}</span>` : ''}
          </div>
          <div class="reagent-desc">${r.description}</div>

          <!-- Quantity / Volume Stepper & Presets -->
          <div class="reagent-amount-selector">
            <span class="amount-label">规格用量：</span>
            <div class="amount-stepper">
              <button class="amount-step-btn btn-minus" data-id="${r.id}" title="减少用量">－</button>
              <span class="amount-display-val font-mono" id="amount-val-${r.id}">${currentAmount} ${r.unit}</span>
              <button class="amount-step-btn btn-plus" data-id="${r.id}" title="增加用量">＋</button>
            </div>
            <div class="amount-presets">
              ${presets
                .map(
                  (p) =>
                    `<button class="amount-preset-chip ${p === currentAmount ? 'active' : ''}" data-id="${r.id}" data-val="${p}">${p}${r.unit}</button>`
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="reagent-action-col">
          <button class="add-to-beaker-btn" id="btn-add-reagent-${r.id}" title="倒入桌上烧杯">
            <span class="add-icon">${isSolid ? '投入烧杯' : '注入烧杯'}</span>
            <span class="add-amt" id="btn-amt-label-${r.id}">${currentAmount} ${r.unit}</span>
          </button>
        </div>
      </div>
    `;
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
        return '活泼非金属';
      case 'noble-gas':
        return '稀有气体';
      case 'lanthanide':
        return '镧系金属';
      case 'actinide':
        return '锕系金属';
      default:
        return '化学元素';
    }
  }

  private bindEvents(): void {
    // Back button
    this.element.querySelector('#btn-back-disciplines')?.addEventListener('click', () => {
      this.onBackToDisciplines();
    });

    // Quick switch to beaker button
    this.element.querySelector('#btn-quick-beaker')?.addEventListener('click', () => {
      this.onViewBeaker?.();
    });

    // Category filter tabs
    const tabs = this.element.querySelectorAll('.category-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const cat = (tab as HTMLElement).dataset.cat || 'all';
        this.filterCategory(cat);
      });
    });
  }

  private filterCategory(category: string): void {
    this.activeCategoryFilter = category;
    const cells = this.element.querySelectorAll('.element-cell');
    cells.forEach((cell) => {
      const el = cell as HTMLElement;
      if (category === 'all' || el.dataset.cat === category) {
        el.style.opacity = '1.0';
        el.style.pointerEvents = 'auto';
        el.style.filter = 'none';
      } else {
        el.style.opacity = '0.22';
        el.style.pointerEvents = 'none';
        el.style.filter = 'grayscale(80%)';
      }
    });
  }
}

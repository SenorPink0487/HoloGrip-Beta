// Lightweight vector schematics live entirely inside the existing spatial window.
// Coordinates also anchor the numbered, keyboard-accessible controls in TutorialPanel.
const path = (d: string, cls = '') => `<path d="${d}" class="${cls}"/>`;
const box = (x: number, y: number, w: number, h: number, r = 8, cls = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="${cls}"/>`;
const circle = (x: number, y: number, r: number, cls = '') => `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`;
const label = (x: number, y: number, text: string) => `<text x="${x}" y="${y}">${text}</text>`;
const rail = path('M60 235H505M75 241H490M92 241V249M470 241V249');
const screen = box(433, 73, 67, 139, 9, 'tutorial-glass') + path('M465 212V235M446 235H485');
const source = box(64, 132, 71, 40, 12) + circle(135, 152, 9, 'tutorial-brass') + path('M95 172V235');
const beam = path('M145 152H432', 'tutorial-ray');
const ticks = Array.from({ length: 15 }, (_, i) => path(`M${92 + i * 25} 235v${i % 5 === 0 ? -10 : -5}`)).join('');
const bench = rail + ticks;
const vessel = (x: number) => path(`M${x} 97v97q0 15 15 15h35q15 0 15-15V97M${x - 5} 97h75`) + path(`M${x + 2} 151h61v41q0 14-14 14h-33q-14 0-14-14Z`, 'tutorial-glass');
const terminal = (text: string) => box(392, 66, 114, 115, 12, 'tutorial-glass') + path('M407 148h80M449 181v52M426 233h46') + label(408, 92, text);
const piston = box(229, 91, 100, 150, 16, 'tutorial-glass') + box(234, 135, 90, 12, 4, 'tutorial-brass') + path('M279 135V51M243 51h72M218 247h122M214 91v150M344 91v150');

export function tutorialIllustration(id: string): string {
  switch (id) {
    case 'getting-started':
      return box(66, 72, 185, 135, 20, 'tutorial-glass') + path('M66 107h185M90 90h45') +
        box(88, 123, 57, 56, 10) + box(165, 123, 61, 56, 10) +
        path('M290 212V115l52 69-30-2-16 29Z', 'tutorial-brass') +
        box(379, 65, 134, 45, 22, 'tutorial-glass') + label(400, 94, '使用教程') +
        path('M349 152q64 6 83 56', 'tutorial-ray') + box(395, 220, 123, 43, 21) + label(417, 248, '退出教程');
    case 'chemistry':
      return vessel(115) + vessel(350) + path('M382 84l-22 84M111 219h77M347 219h78') +
        circle(280, 83, 14, 'tutorial-brass') + circle(319, 65, 10, 'tutorial-glass') + circle(325, 103, 11, 'tutorial-glass') + path('M293 78l17-9M294 90l20 9') +
        box(393, 233, 132, 34, 17, 'tutorial-glass') + label(411, 255, '输入 · 分析');
    case 'optics-reflection-refraction':
      return circle(280, 151, 109) + circle(280, 151, 99) +
        path('M173 151a107 107 0 0 0 214 0Z', 'tutorial-glass') + path('M280 43v214M171 151h218', 'tutorial-dashed') +
        path('M184 62l96 89 93-89M280 151l47 93', 'tutorial-ray') +
        path('M253 126q26-21 52 0M280 184q17 0 24-10') + label(395, 162, 'θ') + path('M270 260v14M229 275h101');
    case 'optics-dispersion':
      return bench + source + screen + path('M153 152h86', 'tutorial-ray') +
        path('M273 77l-51 105h104Z', 'tutorial-glass') + path('M273 182v53') +
        ['#fb7185', '#fbbf24', '#86efac', '#67e8f9', '#a78bfa'].map((color, i) => `<path d="M240 152l45 5 158 ${-45 + i * 22}" stroke="${color}"/>`).join('');
    case 'optics-polarization':
      return bench + source + screen + beam +
        [185, 290, 384].map((x, i) => `<ellipse cx="${x}" cy="145" rx="21" ry="57" class="tutorial-glass"/>` + path(`M${x} 202v33M${x - 12} ${i === 1 ? 163 : 110}l24 ${i === 1 ? -36 : 70}`)).join('') +
        label(171, 76, 'P₁') + label(273, 76, 'λ/4') + label(372, 76, 'P₂');
    case 'optics-diffraction':
    case 'optics-double-slit': {
      const double = id === 'optics-double-slit';
      return bench + source + screen + path('M148 152h104', 'tutorial-ray') +
        box(252, 86, 28, 119, 7) + path('M266 205v30M280 181h37') + circle(319, 181, 14, 'tutorial-brass') +
        path(double ? 'M260 135h12M260 164h12' : 'M260 151h12', 'tutorial-ray') +
        path('M280 151l154-58M280 151h154M280 151l154 52', 'tutorial-dashed') +
        Array.from({ length: 7 }, (_, i) => box(445, 88 + i * 17, 43, double ? 6 : i === 3 ? 17 : 4, 2, 'tutorial-light')).join('');
    }
    case 'mech-free-fall':
      return box(181, 48, 99, 210, 39, 'tutorial-glass') + path('M195 55h70M195 251h70M230 258v16M171 275h119') +
        circle(209, 152, 10, 'tutorial-brass') + path('M247 130q22 24 0 46-22-22 0-46ZM247 126v58') +
        path('M210 91v31m-6-8 6 8 6-8M280 222h60q18 0 18-18v-4', 'tutorial-ray') +
        box(348, 178, 95, 63, 13) + circle(395, 208, 15) + label(358, 267, '抽气 / 放气');
    case 'mech-galileo':
      return bench + path('M70 87l147 113q12 9 24 9h68q13 0 24-8l151-109M70 96l147 113q12 9 24 9h68q13 0 24-8l151-109') +
        circle(108, 104, 12, 'tutorial-brass') + path('M71 87h413', 'tutorial-dashed') +
        path('M450 109l34-17-2 38M349 199q47-2 94-5', 'tutorial-ray') + label(253, 76, 'h₀');
    case 'mech-center-of-gravity':
      return path('M127 265h224M148 260V47h160v23M228 70v19') +
        path('M228 86l126 40 32 88-104 42-83-77Z', 'tutorial-glass') +
        circle(228, 91, 7, 'tutorial-brass') + circle(347, 133, 6) +
        path('M228 98l47 148M347 137l-72 109', 'tutorial-ray') + circle(275, 225, 8, 'tutorial-brass') +
        path('M419 145v72m-8-11 8 11 8-11', 'tutorial-dashed');
    case 'mech-newton-third':
      return bench + path('M74 233V57h71v25M109 82v21M110 195v35') +
        box(91, 104, 39, 89, 12, 'tutorial-glass') + path('M106 116l8 8-8 8 8 8-8 8 8 8M110 165v22') +
        box(204, 113, 94, 44, 13, 'tutorial-glass') + box(325, 113, 94, 44, 13, 'tutorial-glass') +
        path('M298 134q14-14 14 0t13 0M217 134h66M339 134h66M189 135h-28m9-7-9 7 9 7M434 135h37m-9-7 9 7-9 7', 'tutorial-ray');
    case 'mech-newton-cannon':
      return circle(278, 165, 68, 'tutorial-glass') + path('M226 171l18-31 21 15 19-34 28 24 25-1M271 99l8-19 10 18') +
        `<ellipse cx="278" cy="165" rx="137" ry="105" class="tutorial-dashed"/>` +
        path('M279 80q195-51 230 101M279 80q105 1 88 89', 'tutorial-ray') +
        circle(427, 122, 5, 'tutorial-brass') + label(61, 268, '抛落') + label(252, 290, '环绕') + label(459, 269, '逃逸');
    case 'mech-lever-pulley':
      return bench + path('M78 133l250-23M244 119l-27 101h54Z', 'tutorial-glass') +
        circle(244, 119, 8, 'tutorial-brass') + path('M135 130v29M300 113v46') +
        box(122, 159, 26, 38, 5, 'tutorial-brass') + box(287, 159, 26, 38, 5, 'tutorial-brass') +
        path('M381 56h95M418 56v13M394 99v72q0 24 24 24t24-24V99h34v117') +
        circle(418, 99, 27) + circle(418, 171, 22) + path('M418 194v21') + box(400, 215, 36, 34, 6, 'tutorial-brass') +
        path('M476 213v29m-7-9 7 9 7-9', 'tutorial-ray');
    case 'em-hall':
      return bench + path('M149 97h68v-29h126v29h68v84h-68v29H217v-29h-68Z') +
        box(225, 120, 111, 37, 6, 'tutorial-glass') + path('M280 94v85m-7-11 7 11 7-11', 'tutorial-ray') +
        [244, 268, 291, 316].map(x => circle(x, 139, 4, 'tutorial-brass')).join('') +
        terminal('U_H') + path('M409 119h-41v25h-31M407 152h-30v-2h-40');
    case 'em-field':
      return circle(176, 150, 23, 'tutorial-brass') + circle(387, 150, 23, 'tutorial-glass') +
        path('M167 150h18M176 141v18M378 150h18') +
        [45, 85, 125].map(h => path(`M199 144C230 ${150 - h} 333 ${150 - h} 364 144M199 156C230 ${150 + h} 333 ${150 + h} 364 156`, 'tutorial-ray')).join('') +
        path('M199 150h165', 'tutorial-ray') + `<ellipse cx="176" cy="150" rx="58" ry="94" class="tutorial-dashed"/>`;
    case 'em-capacitor-discharge':
      return bench + path('M91 109h112M230 109l31-30M237 109h68v77h72M377 164v44M392 164v44M392 186h93v49H91V109') +
        box(75, 135, 33, 57, 7, 'tutorial-brass') + path('M81 145h21M91 137v16') +
        box(292, 138, 26, 32, 4) + terminal('I–t') + path('M408 115q10 30 30 30h49', 'tutorial-ray');
    case 'em-hand-rules':
      return path('M256 244l-28-74q-4-17 11-19l22 37-19-92q-3-16 12-19 11-2 15 13l16 66-5-96q0-16 14-16t14 16l6 94 8-70q2-16 15-14t11 18l-7 79 15-41q5-14 17-8 10 5 5 17l-19 63-2 46Z', 'tutorial-glass') +
        path('M117 88v126m-9-14 9 14 9-14M81 153q-9-50 37-52t49 49', 'tutorial-ray') +
        path('M390 210h112m-13-8 13 8-13 8', 'tutorial-ray') + label(109, 73, 'I') + label(490, 194, 'B');
    case 'thermo-carnot':
      return bench + box(88, 154, 84, 63, 12, 'tutorial-brass') + box(207, 125, 110, 61, 16, 'tutorial-glass') +
        path('M251 131v49M251 156l113-8M132 154v-25h75M172 218h100v-32') +
        circle(364, 149, 47) + circle(364, 149, 8, 'tutorial-brass') + terminal('P–V') +
        path('M407 139q7-28 36-29l43 18q-36 4-43 24Z', 'tutorial-ray');
    case 'thermo-fire-syringe':
      return piston + path('M279 188q-31 32-2 45 29-13 2-45Z', 'tutorial-brass') +
        path('M369 105v74m-9-12 9 12 9-12', 'tutorial-ray') + label(378, 214, '快速 ↓');
    case 'thermo-fourier':
      return bench + box(75, 148, 73, 65, 11, 'tutorial-brass') + box(412, 148, 73, 65, 11, 'tutorial-glass') +
        box(149, 173, 262, 16, 7) + box(181, 62, 208, 56, 10, 'tutorial-glass') +
        [191, 235, 279, 323, 367].map((x, i) => path(`M${x} 118v54`) + label(x - 7, 99, `T${i + 1}`)).join('') +
        path('M157 157h239m-12-7 12 7-12 7', 'tutorial-ray');
    case 'thermo-phase-change':
      return vessel(102) + vessel(244) + box(125, 74, 22, 110, 10, 'tutorial-glass') + box(265, 74, 22, 110, 10, 'tutorial-glass') +
        path('M135 211q-19 29 0 35 19-6 0-35ZM277 211q-19 29 0 35 19-6 0-35Z', 'tutorial-brass') +
        terminal('T–t') + path('M406 145l19-31h28l32-22M406 145q44-7 79-31', 'tutorial-ray');
    case 'thermo-gas-laws':
      return box(132, 97, 100, 132, 14, 'tutorial-glass') + box(137, 138, 90, 11, 4, 'tutorial-brass') +
        path('M182 138V57M148 57h68M119 235h140M232 181h36v42') + circle(273, 235, 14, 'tutorial-brass') +
        terminal('p · V · T') + path('M408 110q16 30 76 35M408 145l76-43', 'tutorial-ray') +
        [164, 187, 210].map(x => circle(x, 184 + (x % 9), 4, 'tutorial-brass')).join('');
    case 'math-stereometry':
      return path('M172 107l140-49 107 65v119l-140 48-107-65ZM172 107l107 66 140-50M279 173v117', 'tutorial-glass') +
        path('M172 225l140-49 107 66M312 58v118', 'tutorial-dashed') +
        path('M172 107l247 135M172 225l247-102', 'tutorial-ray') +
        [circle(172, 107, 5), circle(312, 58, 5), circle(419, 123, 5), circle(279, 290, 5)].join('');
    default: return '';
  }
}

import type { ExperimentMetadata } from '../../core/types.ts';
import { metadata as reflection } from '../../experiments/catalog/optics-reflection-refraction/meta.ts';
import { metadata as dispersion } from '../../experiments/catalog/optics-dispersion/meta.ts';
import { metadata as polarization } from '../../experiments/catalog/optics-polarization/meta.ts';
import { metadata as diffraction } from '../../experiments/catalog/optics-diffraction/meta.ts';
import { metadata as doubleSlit } from '../../experiments/catalog/optics-double-slit/meta.ts';
import { metadata as freeFall } from '../../experiments/catalog/mech-free-fall/meta.ts';
import { metadata as galileo } from '../../experiments/catalog/mech-galileo/meta.ts';
import { metadata as gravity } from '../../experiments/catalog/mech-center-of-gravity/meta.ts';
import { metadata as thirdLaw } from '../../experiments/catalog/mech-newton-third/meta.ts';
import { metadata as cannon } from '../../experiments/catalog/mech-newton-cannon/meta.ts';
import { metadata as lever } from '../../experiments/catalog/mech-lever-pulley/meta.ts';
import { metadata as hall } from '../../experiments/catalog/em-hall/meta.ts';
import { metadata as field } from '../../experiments/catalog/em-field/meta.ts';
import { metadata as capacitor } from '../../experiments/catalog/em-capacitor-discharge/meta.ts';
import { metadata as handRules } from '../../experiments/catalog/em-hand-rules/meta.ts';
import { metadata as carnot } from '../../experiments/catalog/thermo-carnot/meta.ts';
import { metadata as fireSyringe } from '../../experiments/catalog/thermo-fire-syringe/meta.ts';
import { metadata as fourier } from '../../experiments/catalog/thermo-fourier/meta.ts';
import { metadata as phaseChange } from '../../experiments/catalog/thermo-phase-change/meta.ts';
import { metadata as gasLaws } from '../../experiments/catalog/thermo-gas-laws/meta.ts';
import { metadata as stereometry } from '../../experiments/catalog/math-stereometry/meta.ts';

export interface TutorialStep {
  title: string;
  description: string;
  point: readonly [number, number];
}

export interface TutorialGuide {
  id: string;
  name: string;
  group: string;
  summary: string;
  takeaway: string;
  steps: TutorialStep[];
  parameters: ExperimentMetadata['parameters'];
}

type Step = readonly [title: string, description: string, x: number, y: number];
const steps = (items: Step[]): TutorialStep[] => items.map(([title, description, x, y]) => ({ title, description, point: [x, y] }));
function guide(meta: ExperimentMetadata, summary: string, takeaway: string, items: Step[]): TutorialGuide {
  return { id: meta.id, name: meta.name.replace(/\s*\(.*\)$/, ''), group: meta.categoryName,
    summary, takeaway, steps: steps(items), parameters: meta.parameters };
}

/** Read-only help. Selecting a guide must never mount or reset an experiment. */
export const TUTORIAL_GUIDES: TutorialGuide[] = [
  { id: 'getting-started', name: '从这里开始', group: '基础操作',
    summary: '认识实验室的操作方式，随时找到需要的帮助。',
    takeaway: '教程会记住正在进行的实验。关闭教程后，可以接着操作。', parameters: [],
    steps: steps([
      ['选择实验', '按 V 或点击「悬浮窗口」打开学科目录，选择物理、化学或数学，再选择想体验的实验。', 120, 142],
      ['直接操作器材', '用鼠标或手指点击开关、拖动手柄与旋钮。桌面实验使用自由光标，操作方式详见各实验图解。', 310, 150],
      ['管理空间视窗', '按 V 打开或收起窗口，Esc 关闭，R 校准朝向；使用 + / − 缩放窗口。立体几何页面中的 + / − 用于缩放模型。', 460, 97],
      ['随时查阅教程', '点击右上角「使用教程」，从学科与实验卡片进入对应介绍页，阅读原理、公式和操作步骤；使用返回按钮回到目录，退出教程恢复原页面。', 472, 240],
    ]) },
  { id: 'chemistry', name: '烧杯与化学反应', group: '化学',
    summary: '从添加试剂到观察反应，再到查看分子与离子组成。',
    takeaway: '结合颜色、沉淀、气泡与组分变化，判断反应现象。', parameters: [],
    steps: steps([
      ['选择烧杯与试剂', '在化学页面选择左侧或右侧烧杯，点击元素或常用试剂，设置用量后添加。', 150, 145],
      ['加水、搅拌与清空', '在「烧杯成分」页面切换当前烧杯；「加水」加入 50 mL 水，「搅拌」混合溶液，「清空」重置当前烧杯。', 385, 150],
      ['观察组分与分子', '切换「化学物质 / 离子分布」查看组成；点击物质卡片或成分标签，在空间中观察对应分子或晶体模型。', 310, 68],
      ['分析生活中的物质', '在分析输入框中输入物质名称，也可使用语音输入。点击「分析」后，将解析出的成分加入当前烧杯。', 460, 249],
    ]) },
  guide(reflection, '在分度圆盘上追踪光线，理解反射、折射与全反射。', '从法线量角；由光密介质射向光疏介质时，才可能发生全反射。', [
    ['调整入射角', '拖动圆盘上的激光发射器，观察入射光、反射光与折射光随角度一起变化。', 164, 87],
    ['切换入射方向与介质', '使用器材上的控制，切换入射方向和下半部介质，对比不同折射率的光路。', 307, 182],
    ['读取角度与临界状态', '对照法线、角弧与刻度读数；从液体射向空气并增大入射角，观察折射光贴近界面直至全反射。', 427, 103],
  ]),
  guide(dispersion, '让白光穿过三棱镜，在白屏上展开连续光谱。', '比较同一棱镜中红光与紫光的偏折方向和大小。', [
    ['开启白光', '点击灯箱开关，让白光沿水平光路进入三棱镜。', 91, 153],
    ['旋转棱镜与切换材料', '直接拖动三棱镜改变入射角，点击棱镜座上的滚花套环，切换冕牌、火石或金刚石。', 274, 127],
    ['移动接收屏', '沿接光臂拖动白屏，观察屏距改变后光谱宽度的变化。', 462, 154],
  ]),
  guide(polarization, '旋转偏振元件，观察光强、振动方向与偏振状态。', '先比较平行与正交检偏，再探索波片、双折射与光弹现象。', [
    ['旋转起偏器与检偏器', '拖动 P₁、P₂ 调节透振方向，或点击 0° / 45° / 90° 快捷控制，对比透射亮度。', 166, 145],
    ['选择样品与快轴', '切换波片、冰洲石或光弹样品；调节快轴角度，光弹模式下拖动顶部加压螺杆改变载荷。', 297, 121],
    ['观察屏幕与光路', '沿导轨移动接收屏，比较线偏振、圆偏振、椭圆偏振以及双折射光束。', 470, 152],
  ]),
  guide(diffraction, '改变孔阑与缝宽，看光如何越过几何光学的边界。', '单缝越窄，中央明纹越宽；比较时保持其他变量相同。', [
    ['切换光源与孔阑', '使用光源控制选择波长；转动孔阑转换轮，选择单缝、双缝、圆孔或光栅。', 124, 143],
    ['调节测微鼓轮', '拖动测微鼓轮微调狭缝宽度，对比中央亮斑和两侧次级条纹。', 278, 180],
    ['改变屏距并读取图样', '沿导轨拖动观测屏，结合屏上光强曲线观察图样展宽。', 468, 139],
  ]),
  guide(doubleSlit, '用两个相干次波源，在接收屏上形成明暗相间的干涉条纹。', '条纹间距随波长和屏距增大而增大，随双缝间距增大而减小。', [
    ['选择相干光源', '切换单色激光或复合白光，比较单色明暗条纹与白光彩色干涉。', 95, 142],
    ['调整双缝', '拖动测微鼓轮或点击四档转换轮调节双缝间距，观察条纹疏密变化。', 278, 168],
    ['移动屏幕与测量条纹', '沿导轨拖动接收屏，通过屏上的游标标尺读取条纹位置，并对比不同屏距下的间距。', 465, 132],
  ]),
  guide(freeFall, '对比空气和真空中，羽毛、硬币与软木塞的下落。', '空气阻力减弱后，不同物体的下落趋于同步。', [
    ['倒转牛顿管', '点击管身或旋转按钮，将牛顿管倒转 180°，让管内物体重新下落。', 209, 108],
    ['抽气与放气', '点击抽气机开关降低管内气压，点击阀门放气；在不同气压下重复倒转。', 401, 195],
    ['对比下落过程', '结合慢动作观察羽毛、硬币和软木塞的落差，对比常压与接近真空时的结果。', 236, 209],
  ]),
  guide(galileo, '从双斜面出发，逐渐理解理想水平面上的惯性运动。', '右侧倾角越小，达到相同高度所需的路程越长。', [
    ['释放小球', '点击小球开始运动，观察它由左侧斜面滑下，再爬上右侧斜面。', 102, 95],
    ['调整右侧斜面', '拖动右上角方向标改变右侧倾角与坡长，逐渐将右侧调至水平。', 454, 107],
    ['比较高度与路程', '对照基准高度与轨道上的运动，观察真实微小摩擦下的衰减，以及水平轨道上的运动趋势。', 310, 198],
  ]),
  guide(gravity, '悬挂同一块薄板两次，用铅垂线的交点寻找重心。', '每次悬挂都等待摆动稳定，再用不同悬挂点重复测量。', [
    ['挂起薄板', '点击薄板上的小孔可自动挂起；也可以拖动薄板，将孔靠近销钉后松手。', 228, 89],
    ['等待稳定', '让薄板自然摆动并逐渐停止，稳定后观察刻在板面上的铅垂线。', 310, 168],
    ['向下取下并换孔', '按住已悬挂的薄板向下拖动即可脱钩，再换一个小孔悬挂，生成另一条铅垂线。', 405, 204],
    ['找到重心', '多条铅垂线的交点即为重心，观察板面上的三维重心标记。', 276, 226],
  ]),
  guide(thirdLaw, '用互相连接的测力计，观察作用力与反作用力。', '两表受力大小相等、方向相反，分别作用在不同物体上。', [
    ['拖动互拉测力计', '按住任一互拉测力计或右端手柄，沿水平方向拉动，观察两只表的同步读数。', 394, 145],
    ['比较双表读数', '缓慢增减拉伸程度，对照两表的指针与刻度，观察力的相等关系。', 270, 130],
    ['体验独立测力计', '拖动左侧独立测力计或下方钩码，沿竖直方向施力，比较单表读数与伸长。', 111, 179],
  ]),
  guide(cannon, '从抛落到绕地飞行，探索初速度如何改变引力轨道。', '圆轨道与逃逸速度取决于发射高度，注意区分落地、闭合轨道与逃逸。', [
    ['选择速度预设', '在实验控制页选择亚轨道、环绕、逃逸或速度谱预设，也可手动调节速度范围。', 302, 69],
    ['设置数量并发射', '调整粒子数量后点击发射，同时比较不同速度对应的轨迹。', 453, 182],
    ['观察与清除轨迹', '对比落回地面、绕地运动与逃逸轨迹，使用清除功能移除旧轨迹后再次发射。', 132, 170],
  ]),
  guide(lever, '亲手挂钩码、移动支点，再比较滑轮的省力与费距离。', '杠杆看力矩；滑轮同时比较拉力、绳端路程与重物上升高度。', [
    ['挂载钩码', '拖动标准钩码靠近杠杆刻度孔，吸附位置亮起后松手。将钩码拖离孔位即可取下。', 134, 155],
    ['移动黄铜支点', '水平拖动支点改变两侧力臂，观察杠杆倾斜与平衡状态及器材上的读数。', 245, 211],
    ['切换滑轮与负载', '点击滑轮档位旋钮，在定滑轮、一定一动、二定二动之间切换；点击负载控制切换重物质量。', 419, 103],
    ['向下拉绳', '向下拖动绳端手柄，观察重物上升高度，并读取拉力与路程；松手后观察响应。', 486, 218],
  ]),
  guide(hall, '从载流子偏转到横向电压，理解霍尔效应。', '每次只改变一个变量，再观察霍尔电压与载流子分布。', [
    ['设置磁场与电流', '在实验控制页调节磁感应强度 B 与工作电流 I；使用反向控制观察霍尔电压符号的变化。', 124, 144],
    ['选择试样', '切换 n 型、p 型半导体或金属，调节厚度、浓度与迁移率，比较载流子响应。', 290, 164],
    ['打开微观视图', '切换粒子流与力矢量显示，对照两侧电势积累及电表读数理解平衡过程。', 461, 116],
  ]),
  guide(field, '在空间放置电荷，用电力线观察电场叠加。', '电力线方向以正试探电荷受力方向为准。', [
    ['创建电荷构型', '在实验控制页添加正负电荷，或选择电偶极子、同号电荷与四极子等预设。', 176, 150],
    ['拖动与调节电荷', '在场景中拖动电荷改变位置，并在控制页调节电量，观察叠加场的实时变化。', 387, 150],
    ['观察试探电荷', '拖动金色试探电荷，观察电场矢量箭头的方向和长度如何随位置变化。', 282, 67],
  ]),
  guide(capacitor, '拨动实体开关，观察 RC 电路充电与放电的暂态过程。', '对照电流波形与电容储能变化，理解时间常数 τ = RC。', [
    ['拨动开关充电', '点击台面上的单刀双掷开关，将触刀掷向电池侧，观察电流与电容电场逐渐变化。', 238, 116],
    ['切换到放电', '将触刀掷向放电电阻侧，观察电流方向以及电容电场衰减。', 362, 180],
    ['读取台面示波器', '在器材自带示波器上观察 I–t 曲线，对比充放电开始时和接近稳定时的电流。', 454, 99],
  ]),
  guide(handRules, '用三维机械手和方向箭头，把电磁定则变成空间关系。', '先确定已知量方向，再用手势判断未知量方向。', [
    ['切换定则', '在实验控制页选择右手螺旋定则或感应右手定则，对照场景中的导线和磁场。', 128, 173],
    ['启用手势映射', '开启手势识别并在控制页启用手势，伸出右手，观察机械手对指节姿态的实时映射。', 307, 120],
    ['反转方向进行验证', '使用电流、磁场或运动方向的反转控制，对照箭头与判断结果，验证定则关系。', 455, 211],
  ]),
  guide(carnot, '观察活塞与飞轮，沿 P–V 图理解四个热力学过程。', '比较热源温差、循环做功与热机效率的关系。', [
    ['设置高低温热源', '在实验控制页调节高温热源与低温冷源，观察温差改变后循环与效率的变化。', 127, 189],
    ['观察机械循环', '对照活塞与飞轮的运动，识别等温膨胀、绝热膨胀、等温压缩与绝热压缩。', 315, 169],
    ['读取 P–V 曲线', '在控制页查看实时 P–V 循环与热量、做功读数，使用重置恢复标准状态。', 454, 89],
  ]),
  guide(fireSyringe, '用同样的空气，比较快速压缩与缓慢压缩的温度变化。', '快速压缩时热量来不及散出，机械功主要转化为内能。', [
    ['向下压活塞', '按住 T 形手柄向下拖动；快速猛压，观察气体升温与底部火绒的引燃。', 279, 66],
    ['慢速压缩对比', '缓慢下压手柄，观察散热作用下的温度变化，并与快速压缩对比。', 371, 145],
    ['上提复位', '将手柄向上提回初始位置，更换新火绒后重复实验。', 279, 239],
  ]),
  guide(fourier, '让热量沿金属棒传播，用五个探头追踪温度分布。', '比较达到稳态前后的温度曲线，以及不同材料的传热差异。', [
    ['设置两端温度', '在实验控制页调节左侧加热炉与右侧水浴温度，建立温度差。', 113, 177],
    ['比较金属材料', '切换导热棒材料，观察导热系数和热流密度的变化。', 296, 184],
    ['读取五探头与曲线', '对照 T₁ 至 T₅ 读数与 T(x) 曲线；重置温度场后重新观察热波传播到稳态的过程。', 389, 86],
  ]),
  guide(phaseChange, '并排加热晶体与非晶体，比较熔化过程中的温度曲线。', '晶体的熔点平台对应持续吸热而温度保持不变的过程。', [
    ['点燃两侧酒精灯', '点击对应酒精灯点火或熄灭，分别给晶体与非晶体进行水浴加热。', 133, 231],
    ['观察物态变化', '观察两侧试管中样品的固液变化，比较晶体熔化与非晶体逐渐软化。', 277, 136],
    ['比较温度曲线', '使用采集器的通道控制切换曲线显示，比较晶体的平台与非晶体连续升温；熄火后冷却并重置曲线。', 450, 130],
  ]),
  guide(gasLaws, '通过活塞、锁销与温控旋钮，探索气体的三种状态变化。', '先确认固定的是温度、体积还是压强，再比较其余两个变量。', [
    ['选择实验定律', '点击采集终端的模式实体键，切换玻意耳等温、查理等容或盖–吕萨克等压过程；也可通过黄铜锁销切换状态。', 451, 130],
    ['等温：拖动活塞', '在玻意耳模式下，上下拖动 T 形手柄改变体积，对照压强读数与 p–V 曲线。', 182, 83],
    ['等容 / 等压：调节温度', '在查理或盖–吕萨克模式下，拖动底座黄铜温控旋钮改变温度，观察压强或体积响应。', 273, 232],
  ]),
  guide(stereometry, '把立体图形变成可旋转、连线、剖切和展开的空间模型。', '选择合适的视图和辅助结构，再分析点、线、面之间的关系。', [
    ['选择模型与尺寸', '在控制页切换正方体、棱锥、棱柱或圆柱圆锥，调节底边与高度；也可导入题目照片识别模型。', 145, 113],
    ['旋转与关键点连线', '切换交互模式旋转观察或连接关键点；使用清除连线功能重新作图。', 376, 100],
    ['添加辅助结构', '按需切换坐标系、虚线、中点、面心、外接球、内切球与包围盒，辅助理解几何关系。', 282, 209],
    ['剖切、展开与三视图', '开启剖切、调整展开进度或分离距离，结合正交三视图与预设视角观察模型。', 458, 223],
  ]),
];

export const TUTORIAL_GROUPS = [...new Set(TUTORIAL_GUIDES.map(item => item.group))];
export function findTutorial(id: string): TutorialGuide {
  return TUTORIAL_GUIDES.find(item => item.id === id) ?? TUTORIAL_GUIDES[0];
}

export function escapeTutorialText(value: string | number): string {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

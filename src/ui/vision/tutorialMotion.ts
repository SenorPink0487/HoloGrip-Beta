/**
 * Apple-grade native text motion for tutorial transitions.
 * Emulates Apple's SwiftUI `.blurReplace` / visionOS spatial defocus transition:
 * - Optical Gaussian defocus blur dissipation (blur(8px) -> blur(0px))
 * - Fluid upward drift with Apple's standard spring cubic-bezier curve (cubic-bezier(0.16, 1, 0.3, 1))
 * - Hierarchical typography cascade
 * Strictly animates text only; never alters CSS3D window frame geometry or uses scale.
 */

export const APPLE_SPRING_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const APPLE_TEXT_DURATION = 350;

export function animateTutorialText(elements: Iterable<HTMLElement>): Animation[] {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return [];
  }

  const items = Array.from(elements);
  if (!items.length) return [];

  return items.flatMap((element, index) => {
    const tag = element.tagName ? element.tagName.toUpperCase() : '';
    const isHeading = tag === 'H1' || tag === 'H2' || tag === 'H3' || element.classList?.contains?.('tutorial-intro');
    const isSmall = tag === 'SMALL' || element.classList?.contains?.('tutorial-step-number') || element.classList?.contains?.('tutorial-eyebrow');
    const distance = isHeading ? 8 : (isSmall ? 4 : 6);
    const midDistance = Number((distance * 0.22).toFixed(1));

    // Stagger delay calculated with Apple's hierarchical decay:
    // Natural cascade that tops out cleanly without sluggishness.
    const delay = Math.min(index * 20, 140);

    const animation = element.animate?.([
      {
        opacity: 0,
        filter: 'blur(8px)',
        transform: `translateY(${distance}px)`,
      },
      {
        opacity: 0.85,
        filter: 'blur(1.5px)',
        transform: `translateY(${midDistance}px)`,
        offset: 0.44,
      },
      {
        opacity: 1,
        filter: 'blur(0px)',
        transform: 'translateY(0px)',
      },
    ], {
      duration: APPLE_TEXT_DURATION,
      delay,
      easing: APPLE_SPRING_EASING,
      fill: 'backwards',
    });

    return animation ? [animation] : [];
  });
}

/**
 * Smooth Apple blurReplace text transition for titles and button labels.
 * Immediately sets textContent if element does not support animate or prefers reduced motion.
 */
export function animateTextSwap(element: HTMLElement | null, newText: string): Animation | null {
  if (!element || element.textContent === newText) return null;
  element.textContent = newText;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return null;
  }
  return element.animate?.([
    {
      opacity: 0,
      filter: 'blur(5px)',
      transform: 'translateY(3px)',
    },
    {
      opacity: 0.88,
      filter: 'blur(1px)',
      transform: 'translateY(0.7px)',
      offset: 0.4,
    },
    {
      opacity: 1,
      filter: 'blur(0px)',
      transform: 'translateY(0px)',
    },
  ], {
    duration: 260,
    easing: APPLE_SPRING_EASING,
    fill: 'backwards',
  }) ?? null;
}

export const TUTORIAL_TEXT_SELECTOR = [
  '.tutorial-directory h3',
  '.tutorial-directory p',
  '.tutorial-eyebrow',
  '.tutorial-intro h2',
  '.tutorial-intro > p',
  '.tutorial-figure figcaption',
  '.tutorial-step-number',
  '.tutorial-step button > span:not(.tutorial-step-number)',
  '.tutorial-step p',
  '.tutorial-detail section > h3',
  '.tutorial-detail section > p',
  '.tutorial-prose p',
  '.tutorial-equations dt',
  '.tutorial-equations dd',
  '.tutorial-preparation h4',
  '.tutorial-preparation p',
  '.tutorial-record h4',
  '.tutorial-record p',
  '.tutorial-observations li',
  '.tutorial-step-description',
  '.tutorial-takeaway p',
  '.tutorial-reference dt',
  '.tutorial-reference dd',
].join(', ');

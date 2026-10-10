const stack: HTMLElement[] = [];
const previous = new Map<HTMLElement, boolean>();
let observer: MutationObserver | undefined;

function restore() {
  for (const [element, inert] of previous) {
    element.toggleAttribute('inert', inert);
  }
  previous.clear();
}

function refresh() {
  restore();
  const top = stack.at(-1);
  if (!top) {
    return;
  }
  let branch: HTMLElement = top.closest<HTMLElement>('[data-modal-layer],.MuiModal-root') ?? top;
  while (branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && sibling instanceof HTMLElement) {
        previous.set(sibling, sibling.hasAttribute('inert'));
        sibling.setAttribute('inert', '');
      }
    }
    if (branch.parentElement === document.body) {
      break;
    }
    branch = branch.parentElement;
  }
}

function containFocus(event: FocusEvent) {
  const top = stack.at(-1);
  const layer = top?.closest('[data-modal-layer],.MuiModal-root') ?? top;
  if (top && event.target instanceof Node && !layer?.contains(event.target)) {
    top.focus({ preventScroll: true });
  }
}

export function registerModal(element: HTMLElement): () => void {
  stack.push(element);
  refresh();
  if (!observer) {
    observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('focusin', containFocus);
  }
  return () => {
    const index = stack.indexOf(element);
    if (index >= 0) {
      stack.splice(index, 1);
    }
    refresh();
    if (stack.length === 0) {
      observer?.disconnect();
      observer = undefined;
      document.removeEventListener('focusin', containFocus);
    }
  };
}

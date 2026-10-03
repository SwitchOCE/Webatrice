import { downloadBlob } from '@app/utils';

import type { FormPost } from './deckServices';

/**
 * Hand-offs from the deck feature to the browser: a URL or a form POST in a
 * new tab, a file download, and printing a document. Each must run inside the click handler
 * that asked for it, or the browser's popup blocker may stop the tab.
 */

/** Save `content` as a file through the browser's download. */
export function saveTextFile(fileName: string, content: string, mime: string): void {
  downloadBlob(content, fileName, `${mime};charset=utf-8`);
}

/** `QDesktopServices::openUrl` for a web page: a new tab, with no opener. */
export function openInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Submit `form` as a urlencoded POST into a new tab — what desktop's
 * `QNetworkAccessManager::post` does, except the site's answer is shown to
 * the user instead of being parsed.
 */
export function submitFormInNewTab({ action, fields }: FormPost): void {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = action;
  form.target = '_blank';
  form.rel = 'noopener noreferrer';
  form.enctype = 'application/x-www-form-urlencoded';
  form.style.display = 'none';
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('textarea');
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  try {
    form.submit();
  } finally {
    form.remove();
  }
}

/**
 * Print `html` through a hidden frame, so the browser's print dialog (with
 * its own preview, like desktop's QPrintPreviewDialog) shows only the deck.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) {
      frame.remove();
      return;
    }
    view.addEventListener('afterprint', () => frame.remove(), { once: true });
    view.focus();
    view.print();
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

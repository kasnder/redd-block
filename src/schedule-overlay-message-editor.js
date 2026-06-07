import Quill from 'quill';
import 'quill/dist/quill.snow.css';

let quillInstance = null;
let onChangeCallback = null;
let ignoreNextChange = false;

function normalizeEditorHtml(value) {
    return String(value || '').replace(/&nbsp;/g, ' ');
}

export function isOverlayMessageEmpty(html) {
    if (!html?.trim()) return true;
    const stripped = html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
    return !stripped;
}

export function plainTextToOverlayMessageHtml(text) {
    const escaped = escapeHtmlForOverlay(text);
    return escaped
        .split(/\n\n+/)
        .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
        .join('');
}

export function normalizeStoredOverlayMessage(message) {
    if (!message?.trim()) return null;
    const trimmed = message.trim();
    if (/<[a-z][^>]*>/i.test(trimmed)) return trimmed;
    return plainTextToOverlayMessageHtml(trimmed);
}

export function escapeHtmlForOverlay(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function sanitizeOverlayMessageHtml(html) {
    if (!html) return '';
    const allowedTags = new Set([
        'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'A',
    ]);
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return '';

    function sanitizeNode(node) {
        Array.from(node.childNodes).forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) return;

            if (child.nodeType !== Node.ELEMENT_NODE) {
                child.remove();
                return;
            }

            if (!allowedTags.has(child.tagName)) {
                while (child.firstChild) {
                    child.parentNode.insertBefore(child.firstChild, child);
                }
                child.remove();
                return;
            }

            Array.from(child.attributes).forEach((attr) => {
                if (child.tagName === 'A' && attr.name === 'href') {
                    const href = attr.value.trim();
                    if (!/^(https?:|mailto:|tel:|#)/i.test(href)) {
                        child.removeAttribute('href');
                    }
                    return;
                }
                child.removeAttribute(attr.name);
            });

            sanitizeNode(child);
        });
    }

    sanitizeNode(root);
    return root.innerHTML;
}

export function initScheduleOverlayMessageEditor(containerEl, { onChange, placeholder } = {}) {
    if (quillInstance) return quillInstance;
    onChangeCallback = onChange;

    quillInstance = new Quill(containerEl, {
        theme: 'snow',
        placeholder: placeholder || '',
        modules: {
            toolbar: [
                ['bold', 'italic', 'underline', 'strike'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['link'],
            ],
        },
        formats: ['bold', 'italic', 'underline', 'strike', 'list', 'link'],
    });

    quillInstance.on('text-change', () => {
        if (ignoreNextChange) {
            ignoreNextChange = false;
            return;
        }
        onChangeCallback?.(getScheduleOverlayMessageEditorHtml());
    });

    return quillInstance;
}

export function destroyScheduleOverlayMessageEditor() {
    if (!quillInstance) return;
    quillInstance = null;
    onChangeCallback = null;
    ignoreNextChange = false;
}

export function setScheduleOverlayMessageEditorHtml(html, { silent = false } = {}) {
    if (!quillInstance) return;
    if (silent) ignoreNextChange = true;

    quillInstance.setText('');
    const normalized = normalizeStoredOverlayMessage(html);
    if (normalized && !isOverlayMessageEmpty(normalized)) {
        quillInstance.clipboard.dangerouslyPasteHTML(0, normalized);
    }
}

export function getScheduleOverlayMessageEditorHtml() {
    if (!quillInstance) return null;
    const text = quillInstance.getText().trim();
    if (!text) return null;
    return normalizeEditorHtml(quillInstance.root.innerHTML);
}

export function setScheduleOverlayMessageEditorPlaceholder(placeholder) {
    if (!quillInstance?.root) return;
    quillInstance.root.dataset.placeholder = placeholder || '';
}

import window from 'window';
import _ from '_';
import $ from '$';
import DOMPurify from 'dompurify';
import * as Settings from 'Storage/Settings';

// Keep the application's editor contract while using the maintained MIT Jodit editor.
class HtmlEditor {
 editor = null;
 plain = null;
 htmlMode = true;
 previousSignature = '';
 cleanData = '';
 blurTimer = 0;
 readOnly = false;
 constructor(element, onBlur = null, onReady = null, onModeChange = null) {
  this.element = element;
  this.onBlur = onBlur;
  this.onReady = onReady;
  this.onModeChange = onModeChange;
  this.resize = _.throttle(() => this.resizeEditor(), 100);
  if (window.Jodit) this.init();
  else window.__initEditor = () => this.init();
 }
 sanitize(html) {
  return DOMPurify.sanitize(html, { ADD_TAGS: ['signature'], ADD_ATTR: ['data-html-editor-font-wrapper'] });
 }
 toHtml(text) {
  const div = window.document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
 }
 toPlain(html) {
  if (window.rainloop_Utils_htmlToPlain) return window.rainloop_Utils_htmlToPlain(this.sanitize(html));
  const div = window.document.createElement('div');
  div.innerHTML = this.sanitize(html).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n');
  return div.textContent;
 }
 init() {
  if (this.editor || !this.element) return;
  const document = window.document;
  this.modeButton = document.createElement('button');
  this.modeButton.type = 'button';
  this.modeButton.className = 'btn btn-small';
  this.modeButton.addEventListener('click', () => this.modeToggle(!this.htmlMode, true));
  this.element.appendChild(this.modeButton);
  this.input = document.createElement('textarea');
  this.element.appendChild(this.input);
  const buttons = ['bold', 'italic', 'underline', '|', 'font', 'fontsize', 'brush', '|', 'ul', 'ol', 'align', '|', 'link', 'image', 'table', '|', 'undo', 'redo'];
  if (Settings.appSettingsGet('allowHtmlEditorSourceButton')) buttons.push('source');
  this.editor = window.Jodit.make(this.input, {
   language: (Settings.settingsGet('Language') || 'en').slice(0, 2).toLowerCase(),
   buttons, buttonsMD: buttons, buttonsSM: buttons, buttonsXS: buttons,
   toolbarAdaptive: false, toolbarSticky: false, height: '100%', minHeight: 100,
   showCharsCounter: false, showWordsCounter: false, showXPathInStatusbar: false,
   disablePlugins: ['file', 'filebrowser', 'video', 'powered-by-jodit', 'speech-recognize', 'ai-assistant'],
   uploader: { insertImageAsBase64URI: true },
   enter: 'br', spellcheck: true, askBeforePasteHTML: false, askBeforePasteFromWord: false,
   defaultActionOnPaste: 'insert_as_html',
   events: {
    blur: () => this.blurTrigger(), focus: () => this.focusTrigger(),
    beforeSetValueToEditor: (value) => typeof value === 'string' ? this.sanitize(value) : value,
    beforePaste: (event) => {
     const html = event.clipboardData && event.clipboardData.getData('text/html');
     if (html) { this.editor.s.insertHTML(this.sanitize(html)); return false; }
     return undefined;
    }
   }
  });
  this.plain = document.createElement('textarea');
  this.plain.setAttribute('aria-label', 'Message text');
  this.plain.className = 'rainloop-plain-editor';
  this.plain.hidden = true;
  this.plain.addEventListener('blur', () => this.blurTrigger());
  this.plain.addEventListener('focus', () => this.focusTrigger());
  this.element.appendChild(this.plain);
  this.modeButton.textContent = 'Switch to plain text';
  this.resize();
  this.resetDirty();
  window.queueMicrotask(() => { if (this.onReady) this.onReady(); });
 }
 blurTrigger() {
  window.clearTimeout(this.blurTimer);
  this.blurTimer = window.setTimeout(() => { if (this.onBlur) this.onBlur(); }, 200);
 }
 focusTrigger() { window.clearTimeout(this.blurTimer); }
 isHtml() { return this.htmlMode; }
 clearCachedSignature() { this.previousSignature = ''; }
 setSignature(signature, html, insertBefore = false) {
  if (!this.editor) return;
  const value = this.htmlMode ? (html ? this.sanitize(signature) : this.toHtml(signature)) : (html ? this.toPlain(signature) : signature);
  let text = this.getData();
  if (this.previousSignature) {
   // Preserve a signature the user has edited rather than silently deleting their work.
   if (!text.includes(this.previousSignature)) return;
   text = text.replace(this.previousSignature, '');
  }
  this.previousSignature = this.htmlMode ? '<br><br><signature>' + value + '</signature>' : '\n\n' + value;
  this.assign(insertBefore ? this.previousSignature + text : text + this.previousSignature);
 }
 assign(value) {
  if (this.htmlMode) this.editor.value = this.sanitize(value);
  else this.plain.value = value;
 }
 checkDirty() { return this.getDataWithHtmlMark() !== this.cleanData; }
 resetDirty() { this.cleanData = this.getDataWithHtmlMark(); }
 getData(wrapIsHtml = false) {
  if (!this.editor) return '';
  if (!this.htmlMode) return this.plain.value;
  const value = this.sanitize(this.editor.value);
  return wrapIsHtml ? '<div data-html-editor-font-wrapper="true" style="font-family: arial, sans-serif; font-size: 13px;">' + value + '</div>' : value;
 }
 getDataWithHtmlMark(wrapIsHtml = false) { return (this.htmlMode ? ':HTML:' : '') + this.getData(wrapIsHtml); }
 modeToggle(html, resize = false) {
  if (!this.editor || html === this.htmlMode) return;
  const value = this.getData();
  if (this.previousSignature) this.previousSignature = html ? this.toHtml(this.previousSignature) : this.toPlain(this.previousSignature);
  this.htmlMode = html;
  this.assign(html ? this.toHtml(value) : this.toPlain(value));
  this.editor.container.hidden = !html;
  this.plain.hidden = html;
  this.modeButton.textContent = html ? 'Switch to plain text' : 'Switch to rich text';
  if (this.onModeChange) this.onModeChange(html);
  this.blurTrigger();
  if (resize) this.resize();
 }
 setHtmlOrPlain(text, focus) { if (text.startsWith(':HTML:')) this.setHtml(text.slice(6), focus); else this.setPlain(text, focus); }
 setHtml(html, focus) {
  if (!this.editor) return;
  this.clearCachedSignature(); this.modeToggle(true); this.assign(html);
  if (focus) this.focus();
 }
 replaceHtml(find, replacement) { if (this.editor && this.htmlMode) this.assign(this.getData().replace(find, replacement)); }
 setPlain(text, focus) {
  if (!this.editor) return;
  this.clearCachedSignature(); this.modeToggle(false); this.assign(text);
  if (focus) this.focus();
 }
 focus() { if (this.editor) { if (this.htmlMode) this.editor.s.focus(); else this.plain.focus(); } }
 hasFocus() { return this.element.contains(window.document.activeElement); }
 blur() { if (this.hasFocus()) window.document.activeElement.blur(); }
 resizeEditor() {
  if (!this.editor) return;
  const height = Math.max(100, $(this.element).innerHeight() - this.modeButton.offsetHeight - 8);
  this.editor.container.style.height = height + 'px';
  this.plain.style.height = height + 'px';
 }
 setReadOnly(value) {
  this.readOnly = !!value;
  if (this.editor) { this.editor.setReadOnly(this.readOnly); this.plain.readOnly = this.readOnly; this.modeButton.disabled = this.readOnly; }
 }
 clear(focus) { this.setHtml('', focus); }
}
export { HtmlEditor, HtmlEditor as default };

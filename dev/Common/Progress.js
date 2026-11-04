import window from 'window';
export function progressJs() {
 let container, bar, beforeEnd;
 const api = {
  setOptions() { return api; },
  start() {
   container = window.document.createElement('div');
   container.className = 'progressjs-container progressjs-theme-rainloop';
   Object.assign(container.style, { position: 'fixed', top: '0', left: '0', right: '0' });
   bar = window.document.createElement('div');
   bar.className = 'progressjs-inner';
   container.appendChild(bar);
   window.document.body.appendChild(container);
   return api;
  },
  set(value) { if (bar) bar.style.width = Math.min(100, Math.max(0, value)) + '%'; return api; },
  onbeforeend(callback) { beforeEnd = callback; return api; },
  end() { if (beforeEnd) beforeEnd(); if (container) container.remove(); return api; }
 };
 return api;
}

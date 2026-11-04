/* RainLoop Webmail (c) RainLoop Team | Licensed under MIT */
// Preserve RainLoop's multiple-scope shortcuts without modifying the npm copy.
(function (window) {
 const original = window.key;
 const key = function(shortcut, scope, handler) {
  if (Array.isArray(scope)) scope.forEach((item) => original(shortcut, item, handler));
  else original(shortcut, scope, handler);
 };
 Object.keys(original).forEach((name) => {
  Object.defineProperty(key, name, { enumerable: true, get: () => original[name], set: (value) => { original[name] = value; } });
 });
 window.key = key;
})(window);

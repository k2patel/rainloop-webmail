import window from 'window';
export function wakeUp(callback, parameters, interval = 60000) {
 let last = Date.now();
 return window.setInterval(() => {
  const now = Date.now();
  if (now > last + interval + 1000) callback(now - last, parameters);
  last = now;
 }, interval);
}

import window from 'window';
const features = {
 cssanimations: ['animation-name', 'none'], backgroundsize: ['background-size', 'cover'],
 boxshadow: ['box-shadow', '0 0 1px black'], rgba: ['color', 'rgba(0,0,0,0.5)'],
 textshadow: ['text-shadow', '0 0 1px black'], csstransitions: ['transition', 'opacity 1s']
};
const root = window.document.documentElement;
root.classList.remove('no-js');
root.classList.add('js');
Object.keys(features).forEach((name) => root.classList.add((window.CSS.supports(...features[name]) ? '' : 'no-') + name));

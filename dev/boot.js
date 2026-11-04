import window from 'window';
import { progressJs } from 'Common/Progress';

window.progressJs = window.progressJs || progressJs();

window.progressJs.onbeforeend(() => {
	const _$ = window.$;
	if (_$) {
		try {
			_$('.progressjs-container').hide();
			window.setTimeout(() => {
				_$('.progressjs-container').remove();
			}, 200); // eslint-disable-line no-magic-numbers
		} catch (e) {} // eslint-disable-line no-empty
	}
});

require('Common/Features');
require('Common/Booter');

if (window.__runBoot) {
	window.__runBoot();
}

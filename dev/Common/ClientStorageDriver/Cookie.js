import window from 'window';
import Cookies from 'js-cookie';
import { isUnd } from 'Common/Utils';
import { CLIENT_SIDE_STORAGE_INDEX_NAME } from 'Common/Consts';

class CookieDriver {
	/**
	 * @param {string} key
	 * @param {*} data
	 * @returns {boolean}
	 */
	set(key, data) {
		let result = false,
			storageResult = null;

		try {
			storageResult = JSON.parse(Cookies.get(CLIENT_SIDE_STORAGE_INDEX_NAME) || 'null');
		} catch (e) {} // eslint-disable-line no-empty

		(storageResult || (storageResult = {}))[key] = data;

		try {
			Cookies.set(CLIENT_SIDE_STORAGE_INDEX_NAME, JSON.stringify(storageResult), {
				expires: 30
			});

			result = true;
		} catch (e) {} // eslint-disable-line no-empty

		return result;
	}

	/**
	 * @param {string} key
	 * @returns {*}
	 */
	get(key) {
		let result = null;

		try {
			const storageResult = JSON.parse(Cookies.get(CLIENT_SIDE_STORAGE_INDEX_NAME) || 'null');
			result = storageResult && !isUnd(storageResult[key]) ? storageResult[key] : null;
		} catch (e) {} // eslint-disable-line no-empty

		return result;
	}

	/**
	 * @returns {boolean}
	 */
	static supported() {
		return !!(window.navigator && window.navigator.cookieEnabled);
	}
}

export { CookieDriver, CookieDriver as default };

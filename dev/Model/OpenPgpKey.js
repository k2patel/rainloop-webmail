import ko from 'ko';

import { isNonEmptyArray } from 'Common/Utils';

import { AbstractModel } from 'Knoin/AbstractModel';

class OpenPgpKeyModel extends AbstractModel {
	/**
	 * @param {string} index
	 * @param {string} guID
	 * @param {string} ID
	 * @param {array} IDs
	 * @param {array} userIDs
	 * @param {array} emails
	 * @param {boolean} isPrivate
	 * @param {string} armor
	 * @param {string} userID
	 */
	constructor(index, guID, ID, IDs, userIDs, emails, isPrivate, armor, userID, nativeKey) {
		super('OpenPgpKeyModel');

		this.index = index;
		this.id = ID;
		this.ids = isNonEmptyArray(IDs) ? IDs : [ID];
		this.guid = guID;
		this.user = '';
		this.users = userIDs;
		this.email = '';
		this.emails = emails;
		this.armor = armor;
		this.nativeKey = nativeKey;
		this.isPrivate = !!isPrivate;

		this.selectUser(userID);

		this.deleteAccess = ko.observable(false);
	}

	getNativeKey() {
		return this.nativeKey;
	}

	getNativeKeys() {
		return this.nativeKey ? [this.nativeKey] : [];
	}

	select(pattern, property) {
		if (this[property]) {
			const index = this[property].indexOf(pattern);
			if (-1 !== index) {
				this.user = this.users[index];
				this.email = this.emails[index];
			}
		}
	}

	selectUser(user) {
		this.select(user, 'users');
	}

	selectEmail(email) {
		this.select(email, 'emails');
	}
}

export { OpenPgpKeyModel, OpenPgpKeyModel as default };

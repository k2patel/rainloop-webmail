import ko from 'ko';
import { trim, delegateRun, log } from 'Common/Utils';

import PgpStore from 'Stores/User/Pgp';

import { getApp } from 'Helper/Apps/User';

import { popup, command } from 'Knoin/Knoin';
import { AbstractViewNext } from 'Knoin/AbstractViewNext';

@popup({
	name: 'View/Popup/AddOpenPgpKey',
	templateID: 'PopupsAddOpenPgpKey'
})
class AddOpenPgpKeyPopupView extends AbstractViewNext {
	constructor() {
		super();

		this.importing = ko.observable(false);
		this.key = ko.observable('');
		this.key.focus = ko.observable(false);
		this.key.error = ko.observable(false);
		this.key.errorMessage = ko.observable('');

		this.key.subscribe(() => {
			this.key.error(false);
			this.key.errorMessage('');
		});
	}

	@command((self) => !self.importing())
	async addOpenPgpKeyCommand() {
		// eslint-disable-next-line max-len
		const reg = /[-]{3,6}BEGIN[\s]PGP[\s](PRIVATE|PUBLIC)[\s]KEY[\s]BLOCK[-]{3,6}[\s\S]+?[-]{3,6}END[\s]PGP[\s](PRIVATE|PUBLIC)[\s]KEY[\s]BLOCK[-]{3,6}/gi,
			openpgpKeyring = PgpStore.openpgpKeyring;

		let keyTrimmed = trim(this.key());

		if (/[\n]/.test(keyTrimmed)) {
			keyTrimmed = keyTrimmed.replace(/[\r]+/g, '').replace(/[\n]{2,}/g, '\n\n');
		}

		this.key.error('' === keyTrimmed);
		this.key.errorMessage('');

		if (!openpgpKeyring || this.key.error()) {
			return false;
		}

		this.importing(true);
		let match = null,
			count = 30,
			imported = false,
			done = false;

		do {
			match = reg.exec(keyTrimmed);
			if (match && 0 < count) {
				if (match[0] && match[1] && match[2] && match[1] === match[2]) {
					let err = null;
					if ('PRIVATE' === match[1]) {
						try {
							await openpgpKeyring.privateKeys.importKey(match[0]);
						} catch (e) {
							err = [e.message];
						}
					} else if ('PUBLIC' === match[1]) {
						try {
							await openpgpKeyring.publicKeys.importKey(match[0]);
						} catch (e) {
							err = [e.message];
						}
					}

					if (err) {
						this.key.error(true);
						this.key.errorMessage(err && err[0] ? '' + err[0] : '');
						log(err);
					}
				}

				imported = true;
				count -= 1;
				done = false;
			} else {
				done = true;
			}
		} while (!done);

		try {
			openpgpKeyring.store();
			await getApp().reloadOpenPgpKeys();
		} catch (e) {
			this.key.error(true);
			this.key.errorMessage(e.message);
		}

		this.importing(false);
		if (!imported || this.key.error()) {
			this.key.error(true);
			return false;
		}

		delegateRun(this, 'cancelCommand');
		return true;
	}

	clearPopup() {
		this.key('');
		this.key.error(false);
		this.key.errorMessage('');
	}

	onShow() {
		this.clearPopup();
	}

	onShowWithDelay() {
		this.key.focus(true);
	}
}

export { AddOpenPgpKeyPopupView, AddOpenPgpKeyPopupView as default };

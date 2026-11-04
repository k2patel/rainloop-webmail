import ko from 'ko';
import key from 'key';
import $ from '$';

import { pString, log } from 'Common/Utils';
import { unlockPrivateKey } from 'Common/OpenPgp';
import { i18n } from 'Common/Translator';
import PgpStore from 'Stores/User/Pgp';
import { KeyState } from 'Common/Enums';

import { popup, command } from 'Knoin/Knoin';
import { AbstractViewNext } from 'Knoin/AbstractViewNext';

@popup({
	name: 'View/Popup/MessageOpenPgp',
	templateID: 'PopupsMessageOpenPgp'
})
class MessageOpenPgpPopupView extends AbstractViewNext {
	constructor() {
		super();

		this.notification = ko.observable('');

		this.selectedKey = ko.observable(null);
		this.privateKeys = ko.observableArray([]);

		this.password = ko.observable('');
		this.password.focus = ko.observable(false);
		this.buttonFocus = ko.observable(false);

		this.resultCallback = null;

		this.submitRequest = ko.observable(false);

		this.sDefaultKeyScope = KeyState.PopupMessageOpenPGP;
	}

	@command((self) => !self.submitRequest())
	async doCommand() {
		this.submitRequest(true);
		const callback = this.resultCallback,
			selectedKey = this.selectedKey();
		try {
			if (callback && selectedKey) {
				const key = await unlockPrivateKey(PgpStore.openpgp, selectedKey.getNativeKey(), pString(this.password()));
				if (this.resultCallback === callback) {
					this.password('');
					this.cancelCommand();
					callback(key);
				}
			}
		} catch (e) {
			log(e);
			this.notification(i18n('PGP_NOTIFICATIONS/DECRYPTION_ERROR'));
		} finally {
			this.submitRequest(false);
		}
	}

	clearPopup() {
		this.notification('');

		this.password('');
		this.password.focus(false);
		this.buttonFocus(false);

		this.selectedKey(false);
		this.submitRequest(false);

		this.resultCallback = null;
		this.privateKeys([]);
	}

	onBuild(oDom) {
		key('tab,shift+tab', KeyState.PopupMessageOpenPGP, () => {
			switch (true) {
				case this.password.focus():
					this.buttonFocus(true);
					break;
				case this.buttonFocus():
					this.password.focus(true);
					break;
				// no default
			}

			return false;
		});

		const self = this;

		oDom.on('click', '.key-list__item', function() {
			// eslint-disable-line prefer-arrow-callback

			oDom
				.find('.key-list__item .key-list__item__radio')
				.addClass('icon-radio-unchecked')
				.removeClass('icon-radio-checked');

			$(this)
				.find('.key-list__item__radio') // eslint-disable-line no-invalid-this
				.removeClass('icon-radio-unchecked')
				.addClass('icon-radio-checked');

			self.selectedKey(ko.dataFor(this)); // eslint-disable-line no-invalid-this

			self.password.focus(true);
		});
	}

	onHideWithDelay() {
		this.clearPopup();
	}

	onShowWithDelay() {
		this.password.focus(true);
		//		this.buttonFocus(true);
	}

	onShow(fCallback, privateKeys) {
		this.clearPopup();

		this.resultCallback = fCallback;
		this.privateKeys(privateKeys);

		if (this.viewModelDom) {
			this.viewModelDom
				.find('.key-list__item')
				.first()
				.click();
		}
	}
}

export { MessageOpenPgpPopupView, MessageOpenPgpPopupView as default };

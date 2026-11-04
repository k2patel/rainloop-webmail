import ko from 'ko';
import _ from '_';
import $ from '$';

import { i18n } from 'Common/Translator';
import { unlockPrivateKey, decryptPgpMessage, verifyPgpMessage } from 'Common/OpenPgp';
import { log, isArray, isNonEmptyArray, pString, isUnd, trim } from 'Common/Utils';

import AccountStore from 'Stores/User/Account';

import { showScreenPopup } from 'Knoin/Knoin';

class PgpUserStore {
	constructor() {
		this.capaOpenPGP = ko.observable(false);

		this.openpgp = null;

		this.openpgpkeys = ko.observableArray([]);
		this.openpgpKeyring = null;

		this.openpgpkeysPublic = ko.computed(() => _.filter(this.openpgpkeys(), (item) => !!(item && !item.isPrivate)));
		this.openpgpkeysPrivate = ko.computed(() => _.filter(this.openpgpkeys(), (item) => !!(item && item.isPrivate)));
	}

	/**
	 * @returns {boolean}
	 */
	isSupported() {
		return !!this.openpgp;
	}

	findKeyByHex(keys, hash) {
		return _.find(keys, (item) => hash && item && (hash === item.id || -1 < item.ids.indexOf(hash)));
	}

	findPublicKeyByHex(hash) {
		return this.findKeyByHex(this.openpgpkeysPublic(), hash);
	}

	findPrivateKeyByHex(hash) {
		return this.findKeyByHex(this.openpgpkeysPrivate(), hash);
	}

	findPublicKeysByEmail(email) {
		return _.compact(
			_.flatten(
				_.map(this.openpgpkeysPublic(), (item) => {
					const key = item && -1 < item.emails.indexOf(email) ? item : null;
					return key ? key.getNativeKeys() : [null];
				}),
				true
			)
		);
	}

	findPublicKeysBySigningKeyIds(signingKeyIds) {
		return _.compact(
			_.flatten(
				_.map(signingKeyIds, (id) => {
					const key = id && id.toHex ? this.findPublicKeyByHex(id.toHex()) : null;
					return key ? key.getNativeKeys() : [null];
				}),
				true
			)
		);
	}

	findPrivateKeysByEncryptionKeyIds(encryptionKeyIds, recipients, returnWrapKeys) {
		let result = isArray(encryptionKeyIds)
			? _.compact(
					_.flatten(
						_.map(encryptionKeyIds, (id) => {
							const key = id && id.toHex ? this.findPrivateKeyByHex(id.toHex()) : null;
							return key ? (returnWrapKeys ? [key] : key.getNativeKeys()) : [null];
						}),
						true
					)
			  )
			: [];

		if (0 === result.length && isNonEmptyArray(recipients)) {
			result = _.uniq(
				_.compact(
					_.flatten(
						_.map(recipients, (sEmail) => {
							const keys = sEmail ? this.findAllPrivateKeysByEmailNotNative(sEmail) : null;
							return keys
								? returnWrapKeys
									? keys
									: _.flatten(
											_.map(keys, (key) => key.getNativeKeys()),
											true
									  )
								: [null];
						}),
						true
					)
				),
				(key) => key.id
			);
		}

		return result;
	}

	/**
	 * @param {string} email
	 * @returns {?}
	 */
	findPublicKeyByEmailNotNative(email) {
		return _.find(this.openpgpkeysPublic(), (item) => item && -1 < item.emails.indexOf(email)) || null;
	}

	/**
	 * @param {string} email
	 * @returns {?}
	 */
	findPrivateKeyByEmailNotNative(email) {
		return _.find(this.openpgpkeysPrivate(), (item) => item && -1 < item.emails.indexOf(email)) || null;
	}

	/**
	 * @param {string} email
	 * @returns {?}
	 */
	findAllPublicKeysByEmailNotNative(email) {
		return _.filter(this.openpgpkeysPublic(), (item) => item && -1 < item.emails.indexOf(email)) || null;
	}

	/**
	 * @param {string} email
	 * @returns {?}
	 */
	findAllPrivateKeysByEmailNotNative(email) {
		return _.filter(this.openpgpkeysPrivate(), (item) => item && -1 < item.emails.indexOf(email)) || null;
	}

	/**
	 * @param {string} email
	 * @param {string=} password
	 * @returns {?}
	 */
	async findPrivateKeyByEmail(email, password) {
		const key = this.findPrivateKeyByEmailNotNative(email);
		try {
			return key ? await unlockPrivateKey(this.openpgp, key.getNativeKey(), pString(password)) : null;
		} catch (e) {
			return null;
		}
	}

	findSelfPrivateKey(password) {
		return this.findPrivateKeyByEmail(AccountStore.email(), password);
	}

	decryptMessage(message, recipients, callback) {
		const privateKeys = this.findPrivateKeysByEncryptionKeyIds(message.getEncryptionKeyIDs(), recipients, true);
		if (!privateKeys.length) {
			callback(null, null);
			return false;
		}
		showScreenPopup(require('View/Popup/MessageOpenPgp'), [
			async (decryptedKey) => {
				try {
					if (!decryptedKey) {
						callback(null, null);
						return;
					}
					const publicKeys = _.flatten(this.openpgpkeysPublic().map((key) => key.getNativeKeys())),
						result = await decryptPgpMessage(this.openpgp, message, decryptedKey, publicKeys),
						privateKey = this.findPrivateKeyByHex(decryptedKey.getKeyID().toHex()),
						publicKey = result.signer ? this.findPublicKeyByHex(result.signer.toHex()) : null;
					callback(
						privateKey,
						result,
						publicKey,
						result.signatures.map((signature) => signature.keyID)
					);
				} catch (e) {
					log(e);
					callback(null, null);
				}
			},
			privateKeys
		]);
		return false;
	}

	async verifyMessage(message, callback) {
		const ids = message.getSigningKeyIDs(),
			publicKeys = this.findPublicKeysBySigningKeyIds(ids);
		try {
			if (publicKeys.length) {
				const result = await verifyPgpMessage(this.openpgp, message, publicKeys),
					key = result.signer ? this.findPublicKeyByHex(result.signer.toHex()) : null;
				callback(key, ids, result.text);
				return;
			}
		} catch (e) {
			log(e);
		}
		callback(null, ids);
	}

	controlsHelper(dom, verControl, success, title, text) {
		if (success) {
			dom
				.removeClass('error')
				.addClass('success')
				.attr('title', title);
			verControl
				.removeClass('error')
				.addClass('success')
				.attr('title', title);
		} else {
			dom
				.removeClass('success')
				.addClass('error')
				.attr('title', title);
			verControl
				.removeClass('success')
				.addClass('error')
				.attr('title', title);
		}

		if (!isUnd(text)) {
			dom.text(trim(text));
		}
	}

	static domControlEncryptedClickHelper(store, dom, armoredMessage, recipients) {
		return async function() {
			let message = null;
			const $this = $(this); // eslint-disable-line no-invalid-this

			if ($this.hasClass('success')) {
				return false;
			}

			try {
				message = await store.openpgp.readMessage({ armoredMessage });
			} catch (e) {
				log(e);
			}

			if (message && message.getEncryptionKeyIDs) {
				store.decryptMessage(
					message,
					recipients,
					(validPrivateKey, decryptedMessage, validPublicKey, signingKeyIds) => {
						if (decryptedMessage) {
							if (validPublicKey) {
								store.controlsHelper(
									dom,
									$this,
									true,
									i18n('PGP_NOTIFICATIONS/GOOD_SIGNATURE', {
										'USER': validPublicKey.user + ' (' + validPublicKey.id + ')'
									}),
									decryptedMessage.text
								);
							} else if (validPrivateKey) {
								const keyIds = isNonEmptyArray(signingKeyIds) ? signingKeyIds : null,
									additional = keyIds
										? _.compact(_.map(keyIds, (item) => (item && item.toHex ? item.toHex() : null))).join(', ')
										: '';

								store.controlsHelper(
									dom,
									$this,
									false,
									i18n('PGP_NOTIFICATIONS/UNVERIFIRED_SIGNATURE') + (additional ? ' (' + additional + ')' : ''),
									decryptedMessage.text
								);
							} else {
								store.controlsHelper(dom, $this, false, i18n('PGP_NOTIFICATIONS/DECRYPTION_ERROR'));
							}
						} else {
							store.controlsHelper(dom, $this, false, i18n('PGP_NOTIFICATIONS/DECRYPTION_ERROR'));
						}
					}
				);

				return false;
			}

			store.controlsHelper(dom, $this, false, i18n('PGP_NOTIFICATIONS/DECRYPTION_ERROR'));
			return false;
		};
	}

	static domControlSignedClickHelper(store, dom, armoredMessage) {
		return async function() {
			let message = null;
			const $this = $(this); // eslint-disable-line no-invalid-this

			if ($this.hasClass('success') || $this.hasClass('error')) {
				return false;
			}

			try {
				message = await store.openpgp.readCleartextMessage({ cleartextMessage: armoredMessage });
			} catch (e) {
				log(e);
			}

			if (message && message.getSigningKeyIDs) {
				store.verifyMessage(message, (validKey, signingKeyIds, verifiedText) => {
					if (validKey) {
						store.controlsHelper(
							dom,
							$this,
							true,
							i18n('PGP_NOTIFICATIONS/GOOD_SIGNATURE', {
								'USER': validKey.user + ' (' + validKey.id + ')'
							}),
							verifiedText
						);
					} else {
						const keyIds = isNonEmptyArray(signingKeyIds) ? signingKeyIds : null,
							additional = keyIds
								? _.compact(_.map(keyIds, (item) => (item && item.toHex ? item.toHex() : null))).join(', ')
								: '';

						store.controlsHelper(
							dom,
							$this,
							false,
							i18n('PGP_NOTIFICATIONS/UNVERIFIRED_SIGNATURE') + (additional ? ' (' + additional + ')' : '')
						);
					}
				});

				return false;
			}

			store.controlsHelper(dom, $this, false, i18n('PGP_NOTIFICATIONS/DECRYPTION_ERROR'));
			return false;
		};
	}

	/**
	 * @param {*} dom
	 * @param {MessageModel} rainLoopMessage
	 */
	initMessageBodyControls(dom, rainLoopMessage) {
		if (dom && !dom.hasClass('inited')) {
			dom.addClass('inited');

			const encrypted = dom.hasClass('encrypted'),
				signed = dom.hasClass('signed'),
				recipients = rainLoopMessage ? rainLoopMessage.getEmails(['from', 'to', 'cc']) : [];

			let verControl = null;

			if (encrypted || signed) {
				const domText = dom.text();
				dom.data('openpgp-original', domText);

				if (encrypted) {
					verControl = $('<div class="b-openpgp-control"><i class="icon-lock"></i></div>')
						.attr('title', i18n('MESSAGE/PGP_ENCRYPTED_MESSAGE_DESC'))
						.on('click', PgpUserStore.domControlEncryptedClickHelper(this, dom, domText, recipients));
				} else if (signed) {
					verControl = $('<div class="b-openpgp-control"><i class="icon-lock"></i></div>')
						.attr('title', i18n('MESSAGE/PGP_SIGNED_MESSAGE_DESC'))
						.on('click', PgpUserStore.domControlSignedClickHelper(this, dom, domText));
				}

				if (verControl) {
					dom.before(verControl).before('<div></div>');
				}
			}
		}
	}
}

export default new PgpUserStore();

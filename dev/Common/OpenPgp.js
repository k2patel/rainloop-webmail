class KeyCollection {
	constructor(api, isPrivate) {
		this.api = api;
		this.isPrivate = isPrivate;
		this.keys = [];
		this.unreadKeys = [];
	}

	async importKey(armor) {
		const keys = this.isPrivate
			? await this.api.readPrivateKeys({ armoredKeys: armor })
			: await this.api.readKeys({ armoredKeys: armor });
		for (let key of keys) {
			if (!this.isPrivate && key.isPrivate()) {
				key = key.toPublic();
			}
			const index = this.keys.findIndex((item) => item.getFingerprint() === key.getFingerprint());
			if (index < 0) {
				this.keys.push(key);
			} else {
				this.keys[index] = await this.keys[index].update(key);
			}
		}
	}

	removeForId(id) {
		const index = this.keys.findIndex((key) => key.getFingerprint() === id || key.getKeyID().toHex() === id);
		return index < 0 ? null : this.keys.splice(index, 1)[0];
	}
}

// Keep the existing local-storage names and armored arrays. Loading never rewrites
// storage, and unsupported entries are retained when another key is added/deleted.
export class OpenPgpKeyring {
	constructor(api, storage) {
		this.storage = storage;
		this.publicKeys = new KeyCollection(api, false);
		this.privateKeys = new KeyCollection(api, true);
	}

	async load() {
		for (const name of ['public', 'private']) {
			const collection = this[name + 'Keys'];
			const armors = JSON.parse(this.storage.getItem('openpgp-' + name + '-keys') || '[]');
			if (!Array.isArray(armors)) {
				throw new Error('Invalid OpenPGP keyring');
			}
			for (const armor of armors) {
				try {
					await collection.importKey(armor);
				} catch (e) {
					collection.unreadKeys.push(armor);
				}
			}
		}
		return this;
	}

	getAllKeys() {
		return this.publicKeys.keys.concat(this.privateKeys.keys);
	}

	store() {
		for (const name of ['public', 'private']) {
			const collection = this[name + 'Keys'];
			const armors = collection.keys.map((key) => key.armor()).concat(collection.unreadKeys);
			this.storage.setItem('openpgp-' + name + '-keys', JSON.stringify(armors));
		}
	}
}

export async function unlockPrivateKey(api, privateKey, passphrase) {
	if (!privateKey || !privateKey.isPrivate()) {
		throw new Error('A private key is required');
	}
	// decryptKey returns a new key; never replace the encrypted keyring entry.
	return privateKey.isDecrypted() ? privateKey : api.decryptKey({ privateKey, passphrase });
}

export async function describePgpKey(key) {
	const primaryUser = await key.getPrimaryUser(),
		userIDs = [];
	for (const user of key.users) {
		try {
			if (user.userID && (await user.verify()) === true) {
				userIDs.push(user.userID.userID);
			}
		} catch (e) {
			// Ignore unsigned, revoked or invalid user IDs when matching recipients.
		}
	}
	return {
		fingerprint: key.getFingerprint(),
		id: key.getKeyID().toHex(),
		ids: key.getKeyIDs().map((id) => id.toHex()),
		user: primaryUser.user.userID.userID,
		userIDs
	};
}

export async function composePgpMessage(api, text, encryptionKeys, signingKey) {
	if (encryptionKeys.length) {
		return api.encrypt({
			message: await api.createMessage({ text }),
			encryptionKeys,
			signingKeys: signingKey || undefined,
			format: 'armored'
		});
	}
	if (!signingKey) {
		throw new Error('An encryption or signing key is required');
	}
	return api.sign({ message: await api.createCleartextMessage({ text }), signingKeys: signingKey, format: 'armored' });
}

export async function verifiedSigner(signatures) {
	// The presence of a signature or key ID is not proof of validity. Every
	// verification promise must settle, including failures, before the UI updates.
	const results = await Promise.all(
		signatures.map(async (signature) => {
			try {
				return (await signature.verified) === true ? signature.keyID : null;
			} catch (e) {
				return null;
			}
		})
	);
	return results.find((keyID) => keyID) || null;
}

export async function decryptPgpMessage(api, message, decryptionKey, verificationKeys) {
	const result = await api.decrypt({ message, decryptionKeys: decryptionKey, verificationKeys, format: 'utf8' });
	return { text: result.data, signer: await verifiedSigner(result.signatures), signatures: result.signatures };
}

export async function verifyPgpMessage(api, message, verificationKeys) {
	const result = await api.verify({ message, verificationKeys, format: 'utf8' });
	return { text: result.data, signer: await verifiedSigner(result.signatures), signatures: result.signatures };
}

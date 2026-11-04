export async function runOpenPgpChecks(api, helpers, report = () => {}) {
	let checks = 0;
	const check = (condition, name) => {
		if (!condition) throw new Error(name);
		++checks;
		report(name);
	};
	const rejects = async (operation, name) => {
		let rejected = false;
		try { await operation(); } catch (_) { rejected = true; }
		check(rejected, name);
	};
	const passphrase = ' test passphrase with spaces ';
	const alice = await api.generateKey({ type: 'rsa', rsaBits: 2048,
		userIDs: [{ name: 'Alice', email: 'alice@example.test' }], passphrase });
	const bob = await api.generateKey({ type: 'ecc', curve: 'curve25519Legacy',
		userIDs: [{ name: 'Bob', email: 'bob@example.test' }], passphrase });
	const eve = await api.generateKey({ type: 'ecc', curve: 'curve25519Legacy',
		userIDs: [{ name: 'Eve', email: 'eve@example.test' }], passphrase });
	const encryptedAlice = await api.readPrivateKey({ armoredKey: alice.privateKey });
	await rejects(() => helpers.unlockPrivateKey(api, encryptedAlice, 'wrong'), 'Wrong passphrase rejected');
	const aliceKey = await helpers.unlockPrivateKey(api, encryptedAlice, passphrase);
	check(aliceKey.isDecrypted() && !encryptedAlice.isDecrypted(), 'Unlock leaves stored private key encrypted');
	const alicePublic = await api.readKey({ armoredKey: alice.publicKey });
	const description = await helpers.describePgpKey(alicePublic);
	check(description.userIDs.includes('Alice <alice@example.test>') && description.ids.includes(description.id),
		'Key metadata uses verified user IDs and current key-ID APIs');
	const unsignedUser = new alicePublic.users[0].constructor(
		api.UserIDPacket.fromObject({ name: 'Forged identity', email: 'forged@example.test' }), alicePublic);
	alicePublic.users.push(unsignedUser);
	check(!(await helpers.describePgpKey(alicePublic)).userIDs.includes('Forged identity <forged@example.test>'),
		'Unsigned recipient identity is ignored');
	alicePublic.users.pop();
	const bobPublic = await api.readKey({ armoredKey: bob.publicKey });
	const bobKey = await helpers.unlockPrivateKey(api, await api.readPrivateKey({ armoredKey: bob.privateKey }), passphrase);
	const evePublic = await api.readKey({ armoredKey: eve.publicKey });
	const text = 'Security regression: café, 日本語\nA second line.';
	const normalized = (value) => value.replace(/\r\n/g, '\n');

	const signed = await helpers.composePgpMessage(api, text, [], aliceKey);
	const signedMessage = await api.readCleartextMessage({ cleartextMessage: signed });
	const verified = await helpers.verifyPgpMessage(api, signedMessage, [alicePublic]);
	check(verified.signer && normalized(verified.text) === text, 'Valid signature covers displayed text');
	check(alicePublic.getKeyIDs().some((id) => id.toHex() === verified.signer.toHex()), 'Verified signer belongs to expected key');
	const tampered = await api.readCleartextMessage({ cleartextMessage: signed.replace('Security regression:', 'Forged message:') });
	check(!(await helpers.verifyPgpMessage(api, tampered, [alicePublic])).signer, 'Tampered signature is not marked valid');
	check(!(await helpers.verifyPgpMessage(api, signedMessage, [evePublic])).signer, 'Wrong verification key is not marked valid');
	await rejects(() => api.readCleartextMessage({ cleartextMessage: signed.replace('Hash:', 'Forged text Hash:') }),
		'Cleartext header spoof rejected');
	check(!await helpers.verifiedSigner([{ keyID: 'fake', verified: Promise.resolve(false) }]), 'False verification result is rejected');
	check(!await helpers.verifiedSigner([{ keyID: 'fake' }]), 'Missing verification result is rejected');

	const encrypted = await helpers.composePgpMessage(api, text, [bobPublic], aliceKey);
	const message = await api.readMessage({ armoredMessage: encrypted });
	const decrypted = await helpers.decryptPgpMessage(api, message, bobKey, [alicePublic]);
	check(normalized(decrypted.text) === text && !!decrypted.signer, 'Signed encrypted message round trip');
	await rejects(async () => helpers.decryptPgpMessage(api, await api.readMessage({ armoredMessage: encrypted }), aliceKey, [alicePublic]),
		'Wrong recipient cannot decrypt');
	const serialized = (await api.readMessage({ armoredMessage: encrypted })).write();
	const bytes = new Uint8Array(await new Response(serialized).arrayBuffer());
	bytes[bytes.length - 1] ^= 1;
	await rejects(async () => helpers.decryptPgpMessage(api, await api.readMessage({ binaryMessage: bytes }), bobKey, [alicePublic]),
		'Ciphertext integrity failure rejected');
	const unsigned = await helpers.composePgpMessage(api, text, [bobPublic], null);
	const unsignedResult = await helpers.decryptPgpMessage(api, await api.readMessage({ armoredMessage: unsigned }), bobKey, [alicePublic]);
	check(normalized(unsignedResult.text) === text && !unsignedResult.signer, 'Unsigned plaintext remains unverified');

	const storage = new Map([
		['openpgp-public-keys', JSON.stringify([alice.publicKey, 'unsupported legacy entry'])],
		['openpgp-private-keys', JSON.stringify([alice.privateKey])]
	]);
	const adapter = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) };
	const before = JSON.stringify([...storage]);
	const keyring = await new helpers.OpenPgpKeyring(api, adapter).load();
	check(JSON.stringify([...storage]) === before, 'Loading legacy keyring never rewrites storage');
	check(keyring.getAllKeys().length === 2, 'Legacy armored key arrays load');
	await keyring.publicKeys.importKey(alice.publicKey);
	check(keyring.publicKeys.keys.length === 1, 'Duplicate key import keeps one fingerprint');
	await keyring.publicKeys.importKey(bob.publicKey);
	keyring.store();
	check(JSON.parse(storage.get('openpgp-public-keys')).includes('unsupported legacy entry'), 'Unsupported legacy entries survive a save');
	check(!(await api.readPrivateKey({ armoredKey: JSON.parse(storage.get('openpgp-private-keys'))[0] })).isDecrypted(),
		'Persisted private key remains encrypted');
	check(!!keyring.publicKeys.removeForId(alicePublic.getFingerprint()), 'Key deletion uses full fingerprint');
	keyring.store();
	const reloaded = await new helpers.OpenPgpKeyring(api, adapter).load();
	check(reloaded.publicKeys.keys.length === 1 && reloaded.publicKeys.keys[0].getFingerprint() === bobPublic.getFingerprint(),
		'Saved keyring reloads after import and deletion');
	return checks;
}

// Hasher emits (newHash, oldHash), while Crossroads.parse's second argument
// is an array of route arguments. Forward only the new hash.
export function connectHashRouting(hasher, router) {
	const parseHash = (hash) => router.parse(hash);
	hasher.initialized.add(parseHash);
	hasher.changed.add(parseHash);
	hasher.init();
}

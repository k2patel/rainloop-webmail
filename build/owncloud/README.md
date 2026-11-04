# Archived ownCloud integration

The legacy ownCloud 5.x integration is not supported or shipped by RainLoop
Webmail 2.x. Its source remains in the archived 1.x Git history. It used obsolete
ownCloud APIs and stored reversibly encoded credentials using a public email-based
key (or a base64 fallback). The standalone maintained fork does not use that code.

An existing ownCloud embedding needs a separate migration to standalone webmail;
the 2.x standalone upgrade procedure is not an in-place ownCloud app upgrade.

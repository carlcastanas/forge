/**
 * Deployment configuration.
 *
 * FORGE is free and MIT licensed. There is no payment processor, no hosted API,
 * and no company mailbox behind this site — the commercial surface that used to
 * live here was removed rather than shipped as an offer nobody can accept. If a
 * deployer later stands one up, this is where its addresses belong.
 */

/**
 * Placeholder mailbox. `example.com` is reserved by RFC 2606 precisely so that
 * documentation cannot accidentally address a real inbox. Replace it on deploy.
 */
export const CONTACT_EMAIL = 'security@example.com';

/** True once the address above has been replaced with a real one. */
export const CONTACT_CONFIGURED = !CONTACT_EMAIL.endsWith('@example.com');

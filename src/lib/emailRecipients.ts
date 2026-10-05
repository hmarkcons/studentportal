// Addresses no email can ever reach. Pure — scripts/email-error-test.mjs.
//
// The checks make staff and students with addresses under reserved test
// domains (zztmp-…@hmark-test.local, …@example.invalid), and some of what
// they exercise emails them — a registration notice, a receipt. Each such
// message went out through the office's real mailbox and came back as a
// bounce; a run of bounces is what a mail host reads as a mailbox sending
// spam. They are not sent at all now: the send is reported as done, which is
// what the action that asked for it expects.

/** The top-level names reserved for testing and examples, which no mail server serves (RFC 2606, 6761). */
const RESERVED_TLDS = ["local", "invalid", "test", "example", "localhost"];
/** The example domains, likewise reserved. */
const RESERVED_DOMAINS = ["example.com", "example.net", "example.org"];

export function isUndeliverableAddress(address: string): boolean {
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  if (!domain) return false;
  const tld = domain.split(".").pop() ?? "";
  return RESERVED_TLDS.includes(tld) || RESERVED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

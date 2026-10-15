# Acceptance

Fixture results below were verified locally on Node.js 24 during extraction.
CI independently checks supported Node versions; a green workflow is separate
from real-provider acceptance. No real email or OAuth credential is a fixture.

| Conditions | Action | Evidence |
|---|---|---|
| Missing host credential / foreign host URL | Refuse startup or host construction | PASS: host.test.mjs |
| Valid local host | Send only the installation credential and scoped payload | PASS: host.test.mjs |
| Invalid JSON / oversized response / inactive socket | Fail boundedly without transport retry or uncaught error | PASS: host.test.mjs |
| Actual entrypoint idle, then SIGTERM | Exit cleanly | PASS: host.test.mjs |
| One account fails, another is healthy | Mark retrying and continue the other account | PASS: runtime.test.mjs |
| Operation ready vs uncertain | Request execution only for ready IDs | PASS: runtime.test.mjs |
| Operation execution fails | Preserve unknown outcome; do not retry in the cycle | PASS: runtime.test.mjs |
| Import pending vs idle / unavailable host | Wait 500 ms vs 30 seconds | PASS: runtime.test.mjs |
| Large or JSON-escaped initial/delta bodies | Split by serialized bytes; checkpoint only after durable batches | PASS: google.test.mjs |
| Gmail history cursor expired | Start a bounded resync using the initial-history limit | PASS: google.test.mjs |
| Duplicate delta IDs / deleted messages | Deduplicate updates and retain deletion markers | PASS: google.test.mjs |
| History obtained before paginated import | Retain initial cursor for subsequent changes | PASS: google.test.mjs |
| Quoted recipient names / large previews | Preserve address mapping and clip UTF-8 bytes | PASS: google.test.mjs |
| Real provider OAuth, receive, send and reconnect | Owner activates and validates with a real account | UNVERIFIED: activation required |
| Native Windows / physical phone callback | Validate on the actual device | UNVERIFIED: activation required |

Source/digest review, host-generation rejection, immutable operation claims and
restore safety belong to host integration tests; these fixtures do not claim
to verify host authorization or provider delivery.

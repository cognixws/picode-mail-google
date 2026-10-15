# Mail Host API v5

The manifest declares an instance process, `mail.provider`, and permissions
`mail:sync` and `mail:execute`. The host injects `PICODE_URL` and
`PICODE_EXT_TOKEN`. Only an HTTP(S) loopback URL without URL credentials is
accepted. Requests use `X-PiCode-Extension-Token`; local host certificates are
accepted only for that loopback endpoint. Do not run this process manually
against a real mailbox.

All paths below start with `/api/ext/v1/mail/`.

| Method / path | Payload / result |
|---|---|
| GET accounts | Returns authorized connected accounts, saved cursor and ready operations for this provider. |
| POST read | `{account, generation, path}`; the host validates provider-pinned, account-scoped GET paths and query keys. |
| POST sync | `{account, generation, cursor, messages, reset, phase}`; cursor is an opaque JSON string, with bounded message batches. |
| POST execute | `{id}` only; host claims and revalidates an immutable ready operation before constructing any provider write. |

The adapter supplies no arbitrary write body, Authorization header or remote
endpoint. The host rejects stale generations and wrong-provider ownership.
Uncertain effects are not automatically replayed. Sync failures are isolated
per account and reported as retrying; error logs contain fixed metadata only.

A pending import waits 500 ms between cycles; idle or unavailable-host cycles
wait 30 seconds. Host responses are limited to 32 MiB with a 45-second socket
inactivity timeout. There is no transport retry. SIGTERM/SIGINT cancel idle
waiting; an in-flight request remains bounded by its transport timeout.

Bodies render as bounded escaped plain text in the host. HTML is converted to
plain text; remote images are not loaded. Initial history bounds are selected
by the host. Cursor reset clears replaceable cache without deleting host-owned
drafts or operation evidence. The host, not the adapter, owns restore policy.

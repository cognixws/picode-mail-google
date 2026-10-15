# Google Mail for COGNIX[WS]

An optional PiCode extension that synchronizes Gmail and Google Workspace accounts with the
COGNIX[WS] Inbox. This is an independently released adapter, not an email client
or an OAuth credential store.

## Install

Requires a host implementing Mail Host API v5 (the Inbox email integration),
Node.js 22 or later, and outbound access to the provider through the host.
No npm packages or build step are required.

1. In Extensions, review and install `https://github.com/cognixws/picode-mail-google`.
2. Review its source, package digest and `mail:sync` / `mail:execute` permissions,
   then enable the extension instance.
3. Open Inbox → Email. Register the provider's public desktop OAuth client ID
   in the host, then connect your account through the provider consent screen.

OAuth registration and real-account/native callback acceptance are activation
steps, not credentials supplied by this repository. Do not put OAuth tokens,
client secrets or personal mail in this repository or extension settings.

## Responsibilities

| Participant | Responsibility |
|---|---|
| Person | Installs the reviewed package, connects accounts, manages agent grants and approves proposed effects. |
| Agent | Uses the host's mail tools only with a current account grant; proposes effects for owner review. |
| Extension | Maps provider messages and incremental cursors, synchronizes bounded batches and requests execution of ready operation IDs. |
| Host | Owns OAuth/vault, account generations, Inbox UI/cache/drafts, permission checks, provider HTTP requests and immutable effect execution. |

Connecting an account grants no agent access and does not start an agent. The
adapter receives message content, so it is trusted code running as your OS user;
it is not an OS sandbox. It receives an installation-scoped host credential,
never provider OAuth token bytes through the mail API.

## Develop and verify

```sh
npm test
```

Tests use synthetic messages and a local fake host. They exercise the actual
process entrypoint without any real account. CI checks Node.js 22 and 24.
See [the host contract](docs/host-contract.md) and
[the acceptance table](docs/acceptance.md). Live account/native validation is
reported separately from fixture coverage.

## Updates

The stable extension ID is `picode-mail-google`. Release 0.2.0 extracts the
previous bundled adapter. Upgrading a legacy local-catalog install requires a
new Git-source and digest review using the same ID; the host preserves account
data. Updates to provider mappings do not require a core release while the host
contract remains compatible. The host remains responsible for backup/restore
and invalidating connection authority after restore.

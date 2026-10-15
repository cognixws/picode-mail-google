# Changelog

## 0.2.1

- Display the Gmail icon in the extension list, review and details.

## 0.2.0

- Extract the adapter into an independently installed PiCode extension.
- Preserve Mail Host API v5, stable extension identity and provider mapping.
- Add standalone provider, host transport and process lifecycle fixtures.
- Bound transport failure handling and stop promptly during idle shutdown.
- Split large Google sync batches by serialized bytes without advancing cursors before durability.

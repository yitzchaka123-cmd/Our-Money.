# Helper P — progress

- C25 (receipt photo in Telegram) — done.
  - New: lib/intake/receipt.ts (AI reading, zod structured output, image as base64 block, model from AI_MODEL),
    lib/telegram/photo.ts (which messages carry a receipt, download with a 10 MB cap, raw_input).
  - handlers.ts: small hook only (dispatch + handlePhoto + optional pre-parsed result into the existing save flow; /start text).
  - client.ts: getFile + downloadFile(fileId, { maxBytes }).
  - No migration: stored as input_kind 'text' with raw_input "[קבלה] <business> · <caption> · file:<file_id>".
  - Tests: tests/receipt.test.ts (AI mocked), tests/integration/telegram-photo.int.test.ts.
  - Follow-up: in a group, only photos with a caption or replying to the bot are read (photoMeantForBot); private chat reads every photo.
  - Lint not run: `next lint` does not work in this repo (Next 16).

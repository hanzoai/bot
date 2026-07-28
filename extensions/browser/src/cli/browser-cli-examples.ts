/**
 * Help examples shown by the Browser CLI root command.
 */
/** Core Browser CLI examples for lifecycle and inspection commands. */
export const browserCoreExamples = [
  "bot browser status",
  "bot browser start",
  "bot browser start --headless",
  "bot browser stop",
  "bot browser tabs",
  "bot browser open https://example.com",
  "bot browser focus abcd1234",
  "bot browser close abcd1234",
  "bot browser screenshot",
  "bot browser screenshot --full-page",
  "bot browser screenshot --ref 12",
  "bot browser snapshot",
  "bot browser snapshot --format aria --limit 200",
  "bot browser snapshot --efficient",
  "bot browser snapshot --labels",
  'bot browser extract "What is the main conclusion?"',
];

/** Browser CLI examples for interaction/action commands. */
export const browserActionExamples = [
  "bot browser navigate https://example.com",
  "bot browser resize 1280 720",
  "bot browser click 12 --double",
  "bot browser click-coords 120 340",
  'bot browser type 23 "hello" --submit',
  "bot browser press Enter",
  "bot browser hover 44",
  "bot browser drag 10 11",
  "bot browser select 9 OptionA OptionB",
  "bot browser upload /tmp/bot/uploads/file.pdf",
  "bot browser upload media://inbound/file.pdf",
  'bot browser fill --fields \'[{"ref":"1","value":"Ada"}]\'',
  "bot browser dialog --accept",
  'bot browser wait --text "Done"',
  "bot browser evaluate --fn '(el) => el.textContent' --ref 7",
  "bot browser evaluate --fn 'const title = document.title; return title;'",
  "bot browser console --level error",
  "bot browser pdf",
  "bot browser batch --actions-file plan.json",
  'bot browser batch --actions \'[{"kind":"wait","timeMs":500},{"kind":"click","ref":"12"},{"kind":"type","ref":"23","text":"hello"}]\'',
  "bot browser batch --actions-file plan.json --continue",
];

/**
 * Our Money shares a Supabase project with other apps. Before any migration
 * reaches it, check that it only ever touches the `money` schema: every
 * object qualified with `money.`, no extensions, no Supabase Auth, no global
 * default privileges. A false alarm costs a rename; a miss can take another
 * app offline.
 */
export const OWN_SCHEMA = 'money';

/** Drop comments and string bodies' line comments so the rules see only SQL. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/** "if [not] exists" is optional; the schema check must look past it, not skip it. */
const IFX = String.raw`(?:if\s+(?:not\s+)?exists\s+)?`;
const NAME = String.raw`[\w"]+`;
const notMoney = (prefix: string) => new RegExp(String.raw`${prefix}(?!${IFX}money\.)${IFX}${NAME}`, 'i');

const RULES: Array<{ pattern: RegExp; problem: string }> = [
  { pattern: /\b(create|drop|alter)\s+extension\b/i, problem: 'touches an extension (extensions are shared — never create, drop or move one)' },
  { pattern: /\bauth\s*\.\s*\w+/i, problem: 'references Supabase Auth (logins are shared by every app)' },
  { pattern: /\bstorage\s*\.\s*\w+/i, problem: 'references Supabase Storage directly' },
  {
    pattern: notMoney(String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(?:unlogged\s+)?(?:table|view|materialized\s+view|sequence|type|function|procedure)\s+`),
    problem: 'creates an object outside the money schema',
  },
  { pattern: /\bcreate\s+(?:unique\s+)?index\b[^;]*?\bon\s+(?!(?:only\s+)?money\.)/i, problem: 'creates an index on a table outside money' },
  { pattern: /\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\b[^;]*?\bon\s+(?!money\.)/i, problem: 'creates a trigger on a table outside money' },
  { pattern: /\bexecute\s+(?:function|procedure)\s+(?!money\.)/i, problem: 'runs a trigger function outside money' },
  {
    pattern: notMoney(String.raw`\b(?:alter|drop|truncate|comment\s+on)\s+(?:table|view|sequence|function|type|index|column)\s+`),
    problem: 'changes an object outside money',
  },
  { pattern: /\b(?:insert\s+into|delete\s+from)\s+(?!money\.)/i, problem: 'writes rows outside money' },
  // An UPDATE statement has a SET; "before insert or update of category" does not.
  { pattern: /\bupdate\s+(?!money\.)[\w".]+\s+set\b/i, problem: 'writes rows outside money' },
  { pattern: /\b(?:on|in)\s+schema\s+(?!money\b)/i, problem: 'grants, revokes or sets defaults on a schema other than money' },
  { pattern: /\balter\s+default\s+privileges\b(?![^;]*\bin\s+schema\s+money\b)/i, problem: 'changes default privileges globally (they must say "in schema money")' },
  { pattern: new RegExp(String.raw`\b(?:create|drop|alter)\s+schema\s+(?!${IFX}money\b)`, 'i'), problem: 'creates or changes a schema other than money' },
  { pattern: /\b(?:create|drop|alter)\s+(?:role|user|database|publication|subscription|event\s+trigger)\b/i, problem: 'changes project-wide objects' },
  { pattern: /\bcron\s*\.\s*schedule\s*\(\s*'(?!money_)/i, problem: 'schedules a cron job without the money_ prefix' },
];

/** Every way this migration could reach outside `money`; empty means safe. */
export function migrationProblems(sql: string): string[] {
  const clean = stripComments(sql);
  // Function bodies are checked too: a body that writes elsewhere is as bad.
  return RULES.filter((rule) => rule.pattern.test(clean)).map((rule) => rule.problem);
}

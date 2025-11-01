import fs from "fs";

const filePath = process.argv[1];
const text = fs.readFileSync(filePath, "utf8");
let line = 1;
let column = 0;
let quote = null;
let escape = false;
const stack = [];
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (ch === '\n') {
    line += 1;
    column = 0;
    escape = false;
    continue;
  }
  column += 1;
  if (quote) {
    if (!escape && ch === quote) {
      quote = null;
    }
    escape = ch === '\\' && !escape;
    continue;
  }
  if (ch === '"' || ch === "'" || ch === '`') {
    quote = ch;
    continue;
  }
  if (ch === '{') {
    stack.push({ line, column });
  } else if (ch === '}') {
    if (stack.length === 0) {
      console.log(`Unmatched closing brace at ${line}:${column}`);
    } else {
      stack.pop();
    }
  }
}
if (stack.length > 0) {
  for (const entry of stack) {
    console.log(`Unclosed brace from ${entry.line}:${entry.column}`);
  }
} else {
  console.log('Braces balanced');
}

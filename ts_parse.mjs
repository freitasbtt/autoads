import fs from "fs";
import ts from "typescript";

const filePath = process.argv[2];
const text = fs.readFileSync(filePath, "utf8");
const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.ES2020, true);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([filePath], { allowJs: false, target: ts.ScriptTarget.ES2020 }));
if (diagnostics.length === 0) {
  console.log("No diagnostics");
} else {
  for (const diag of diagnostics) {
    const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
    const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
    console.log(`${line + 1}:${character + 1} - ${message}`);
  }
}

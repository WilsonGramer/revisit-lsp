/* eslint-disable no-console */

import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse as parseWithSourceMap, Pointers } from 'json-source-map';
import { parseStudyConfig } from '../parser/parser';
import { ParsedConfig, ParserErrorWarning, StudyConfig } from '../parser/types';

const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params) => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Full,
  },
}));

documents.onDidChangeContent(async (e) => {
  if (!e.document.uri.endsWith('/config.json')) {
    return;
  }

  const document = e.document.getText();

  let pointers: Pointers;
  let parsedConfig: ParsedConfig<StudyConfig>;
  try {
    pointers = parseWithSourceMap(document).pointers;
    parsedConfig = await parseStudyConfig(document);
  } catch {
    return;
  }

  const convertDiagnostic = (diagnostic: ParserErrorWarning, severity: DiagnosticSeverity): Diagnostic[] => {
    if (diagnostic.category === 'invalid-config' || diagnostic.category === 'invalid-library-config') {
      // Use the JSON schema validation errors instead
      return [];
    }

    if (!(diagnostic.instancePath in pointers)) {
      return [];
    }

    const { value: start, valueEnd: end } = pointers[diagnostic.instancePath];

    return [{
      severity,
      range: {
        start: { line: start.line, character: start.column },
        end: { line: end.line, character: end.column },
      },
      message: diagnostic.message,
      code: diagnostic.category,
      source: 'revisit',
    }];
  };

  const diagnostics = [
    ...parsedConfig.errors.flatMap((error) => convertDiagnostic(error, DiagnosticSeverity.Error)),
    ...parsedConfig.warnings.flatMap((warning) => convertDiagnostic(warning, DiagnosticSeverity.Warning)),
  ];

  connection.sendDiagnostics({ uri: e.document.uri, diagnostics });
});

documents.listen(connection);
connection.listen();

console.info('LSP started');

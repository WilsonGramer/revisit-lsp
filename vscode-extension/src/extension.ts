import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export const activate = () => {
  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  const serverOptions: ServerOptions = {
    module: `${vscode.workspace.workspaceFolders[0].uri.fsPath}/dist/lsp/index.cjs`,
    transport: TransportKind.ipc,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'json', pattern: '**/config.json' }],
  };

  client = new LanguageClient(
    'revisitLsp',
    'revisit-lsp',
    serverOptions,
    clientOptions,
  );

  client.start();
};

export const deactivate = () => client?.stop();

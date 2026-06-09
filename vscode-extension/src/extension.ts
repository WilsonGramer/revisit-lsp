import * as vscode from 'vscode';
import * as fs from 'node:fs';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

const isRevisitStudy = (workspacePath: string): boolean => {
  const packageJsonPath = `${workspacePath}/package.json`;
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch {
    return false;
  }

  return packageJson.name === 'revisit';
};

let client: LanguageClient | undefined;
export const activate = () => {
  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;

  if (!isRevisitStudy(workspacePath)) {
    return;
  }

  const lintConfigPath = `${workspacePath}/revisit-lint-config.json`;

  let lintConfig = {};
  if (fs.existsSync(lintConfigPath)) {
    try {
      lintConfig = JSON.parse(fs.readFileSync(lintConfigPath, 'utf8'));
    } catch (error) {
      console.warn('failed to read lint config:', error);
    }
  }

  const serverOptions: ServerOptions = {
    module: `${workspacePath}/dist/lsp/index.cjs`,
    transport: TransportKind.ipc,
    options: {
      execArgv: ['--enable-source-maps'],
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'json', pattern: '**/config.json' }],
    initializationOptions: { lintConfig },
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

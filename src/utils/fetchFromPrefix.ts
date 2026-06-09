import { PREFIX } from './Prefix';

/** Fetch `path` from `PREFIX`, or the `public/` directory if running locally */
export async function fetchFromPrefix(path: string) {
  if (import.meta.env.MODE === 'lsp') {
    // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
    const { readFile } = require('fs/promises');

    return await readFile(`./public/${path}`, 'utf-8');
  }

  return (await fetch(PREFIX + path)).text();
}

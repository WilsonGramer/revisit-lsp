import { PREFIX } from './Prefix';

/** Fetch `path` from `PREFIX`, or the `public/` directory if running locally */
export async function fetchFromPrefix(path: string) {
  return (await fetch(PREFIX + path)).text();
}

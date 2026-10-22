import { useEffect, useState } from 'react';

const read = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Current values of CSS colour tokens, re-read when the OS theme flips
 *  (SVG / canvas props need real colours, not var()). */
export function useTokens<K extends string>(names: K[]): Record<K, string> {
  const get = () => Object.fromEntries(names.map((n) => [n, read(`--${n}`)])) as Record<K, string>;
  const [tokens, setTokens] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTokens(get());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return tokens;
}

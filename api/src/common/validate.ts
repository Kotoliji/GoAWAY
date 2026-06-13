import { ZodTypeAny, z } from 'zod';
import { HttpError } from './errors';

/** Parse/validate input or throw a 400 with readable messages.
 *  Returns Zod's *output* type, so `.default()` values are applied. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    throw new HttpError(400, msg);
  }
  return result.data;
}

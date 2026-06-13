import { ZodSchema } from 'zod';
import { HttpError } from './errors';

/** Parse/validate input or throw a 400 with readable messages. */
export function parse<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    throw new HttpError(400, msg);
  }
  return result.data;
}

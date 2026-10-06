import { Transform } from 'class-transformer';

/** Trims string input before validation so whitespace-only values are rejected. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

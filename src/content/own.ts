/**
 * `record[key]` when it is the record's own entry, else undefined. Content
 * records are keyed by ids, and an id such as 'constructor' or 'toString'
 * would otherwise find what every object inherits.
 */
export function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

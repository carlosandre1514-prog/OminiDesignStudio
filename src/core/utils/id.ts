import { nanoid } from 'nanoid';

export const createId = (prefix = ''): string => (prefix ? `${prefix}_${nanoid(12)}` : nanoid(12));

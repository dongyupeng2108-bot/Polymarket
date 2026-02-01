import { ZH } from './zh';

export const t = (key: keyof typeof ZH | string): string => {
  return (ZH as any)[key] || key;
};

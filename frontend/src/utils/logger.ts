const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]): void => {
    if (isDev) {
      console.log(...args);
    }
  },
  info: (...args: unknown[]): void => {
    if (isDev) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]): void => {
    if (isDev) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};

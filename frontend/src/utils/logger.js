// Environment-aware logger
const isDev = import.meta.env.DEV;

export const logger = {
  error: (...args) => {
    if (isDev) {
      console.error(...args);
    }
    // In production, could send to error tracking service
    // e.g., Sentry.captureException(args[0]);
  },

  warn: (...args) => {
    if (isDev) {
      console.warn(...args);
    }
  },

  info: (...args) => {
    if (isDev) {
      console.info(...args);
    }
  },

  debug: (...args) => {
    if (isDev) {
      console.debug(...args);
    }
  }
};

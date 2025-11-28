// Simple wrapper around the loglevel library to keep logging consistent

const LoggerLevels = ["trace", "debug", "info", "warn", "error"];

export class Logger {
  constructor(context = "app") {
    if (!window.log) {
      console.warn(
        "[logger] loglevel library not found. Logging will be a no-op."
      );
      this._logger = console;
      return;
    }
    this._logger = window.log.getLogger(context);
  }

  static configure({ level = "info" } = {}) {
    if (!window.log) return;
    const normalized = LoggerLevels.includes(level) ? level : "info";
    window.log.setLevel(normalized);
  }

  _payload(event, meta) {
    return { event, ...(meta || {}) };
  }

  trace(event, meta) {
    this._logger.trace(this._payload(event, meta));
  }
  debug(event, meta) {
    this._logger.debug(this._payload(event, meta));
  }
  info(event, meta) {
    this._logger.info(this._payload(event, meta));
  }
  warn(event, meta) {
    this._logger.warn(this._payload(event, meta));
  }
  error(event, meta) {
    this._logger.error(this._payload(event, meta));
  }
}

export const appLogger = new Logger("app");



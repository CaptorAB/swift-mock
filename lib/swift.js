/* eslint-disable function-paren-newline */
/* eslint-disable arrow-parens */
/* eslint-disable implicit-arrow-linebreak */
/* eslint-disable comma-dangle */
/* eslint-disable quotes */
const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const patterns = require("./metadata/patterns.json");
const messageGenerator = require("./messageGenerator");
const SwiftParser = require("./swiftParser");
const { Logger, mkDirByPathSync } = require("./utils");

const logger = new Logger();

class Swift {
  constructor(options = {}) {
    if (options.fieldPatterns) {
      this.fieldPatterns = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), options.fieldPatterns))
      );
    } else if (typeof patterns === "string") {
      this.fieldPatterns = JSON.parse(patterns);
    } else {
      this.fieldPatterns = patterns;
    }

    this.parser = new SwiftParser(this.fieldPatterns);
    this.inputFolder = options.in
      ? path.resolve(process.cwd(), options.in)
      : path.resolve(process.cwd(), "./in");
    this.outputFolder = options.out
      ? path.resolve(process.cwd(), options.out)
      : path.resolve(process.cwd(), "./out");
    logger.setLogLevel(options.logLevel || 0);
    logger.setElastic(options.elastic || false);
    this.saveIncomingMessages = options.saveIncomingMessages || false;
    this.filters = [];
    this.filtersEvery = [];
    this.messages = [];
    this.persistent = options.persistent || true;
    this.deleteFiles = options.delete || false;
  }

  run() {
    logger.trace("Starting SWIFT client...");
    if (!fs.existsSync(this.inputFolder)) {
      logger.trace("Input folder is missing. Creating...");
      mkDirByPathSync(this.inputFolder);
    }
    if (!fs.existsSync(this.outputFolder)) {
      logger.trace("Output folder is missing. Creating...");
      mkDirByPathSync(this.outputFolder);
    }

    let promise = Promise.resolve();

    // eslint-disable-next-line no-useless-escape
    this.watcher = chokidar.watch(this.inputFolder, {
      persistent: this.persistent,
      usePolling: true,
      depth: 0,
      ignored: /(^|[/\\])\../,
    });

    this.watcher
      .on("add", (filePath) => {
        logger.trace(`Found new file ${filePath}`);
        promise = Promise.resolve(promise).then(() =>
          new Promise((resolve, reject) => {
            fs.readFile(filePath, { encoding: "UTF-8" }, (err, data) => {
              if (err) reject(err);
              else resolve(data);
            });
          })
            .then((data) => {
              fs.unwatchFile(filePath);
              this.watcher.unwatch(filePath);
              return this.parse(data);
            })
            .then((decoded) => {
              if (this.saveIncomingMessages) {
                this.messages.push(decoded);
              }
              logger.debug("Got Swift message:");
              logger.debug(decoded);
              if (!this.deleteFiles) {
                return decoded;
              }
              return new Promise((resolve, reject) => {
                fs.unlink(filePath, (err) => {
                  if (err) reject(err);
                  else {
                    logger.debug(`Delete incoming file ${filePath}`);
                    resolve(decoded);
                  }
                });
              });
            })
            .then((message) => {
              const passedFilters = this.filtersEvery.filter((filter) =>
                filter.predicate(message)
              );
              const acceptedFilters = [];
              passedFilters.forEach((filter) => {
                acceptedFilters.push(filter.callback);
              });
              return { message, acceptedFilters };
            })
            .then(({ message, acceptedFilters }) => {
              this.filters.some((filter) => {
                if (filter.predicate(message)) {
                  logger.debug(
                    `Found callback for message ${filePath} by predicate`
                  );
                  acceptedFilters.push(filter.callback);
                  return true;
                }
                return false;
              });
              return { acceptedFilters, message };
            })
            .then((final) => {
              const promises = [];
              final.acceptedFilters.forEach((callback) => {
                promises.push(callback(final.message));
              });
              return Promise.all(promises);
            })
            .catch((err) => {
              fs.unwatchFile(filePath);
              this.watcher.unwatch(filePath);
              logger.error(err);
            })
        );
      })
      .on("error", (err) => logger.error(err));
  }

  cleanMessages() {
    this.messages = [];
  }

  getMessages() {
    return this.messages;
  }

  cleanListeners() {
    this.filters = [];
    this.filtersEvery = [];
  }

  on(predicate, callback) {
    if (typeof predicate !== "function") {
      throw new Error("predicate is not a function");
    }
    if (typeof callback !== "function") {
      throw new Error("callback should be a function");
    }

    logger.debug(`Create subscriber: ${predicate.toString()}`);

    this.filters.push({ predicate, callback });
  }

  onEvery(predicate, callback) {
    if (typeof predicate !== "function") {
      throw new Error("predicate is not a function");
    }
    if (typeof callback !== "function") {
      throw new Error("callback should be a function");
    }

    logger.debug(`Create every subscriber: ${predicate.toString()}`);

    this.filtersEvery.push({ predicate, callback });
  }

  close() {
    logger.trace("closing SWIFT client...");
    return this.watcher.close();
  }

  send(message, filenamePrefix = "", outPath = this.outputFolder) {
    let out;
    if (typeof message === "string") {
      out = message;
    }
    if (Array.isArray(message)) {
      out = this.generate(message);
    }
    if (!out) {
      throw new Error("output message was not created");
    }
    if (out instanceof Error) {
      throw out;
    }

    const formattedDate = this.getFormattedDate();
    const filePath = path.resolve(
      outPath,
      `${filenamePrefix !== "" ? `${filenamePrefix}-` : ""}${formattedDate}.fin`
    );
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, out, (err) => {
        if (err) reject(err);
        else {
          logger.trace(`Write outfile ${filePath}`);
          resolve(out);
        }
      });
    });
  }

  parse(swiftMessage) {
    return this.parser.parse(swiftMessage);
  }

  // eslint-disable-next-line class-methods-use-this
  generate(data) {
    return messageGenerator(data);
  }

  // eslint-disable-next-line class-methods-use-this
  getFormattedDate() {
    const date = new Date();
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}-${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds()
    )}`;
  }
}

module.exports = Swift;

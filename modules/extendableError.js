' use strict';

const META = {
    author: "Wolvan",
    name: "ExtendableError",
    description: "A class that makes creating custom errors a lot easier.",
    version: "1.0.0"
};

/*
 *
 * Code by Lee Benson on stackoverflow
 * http://stackoverflow.com/questions/31089801/extending-error-in-javascript-with-es6-syntax/32749533#32749533
 * Thanks a lot, Lee, this ExtendableError class comes in really, super handy
 *
 */
class ExtendableError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = (new Error(message)).stack;
        }
    }
}

module.exports = ExtendableError;
module.exports.META = META;

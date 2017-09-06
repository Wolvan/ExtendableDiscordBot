'use strict';

/*
 *
 * Taken from https://github.com/MeLlamoPablo/minimist-string
 * and modified to return the array instead of a minimist object
 * Thanks a lot to MeLlamoPablo
 *
 * This code is licensed under Apache License 2.0, all copyright goes to MeLlamoPablo
 *
 */

(function() {

    /**
     * Parses a string and returns an array like process.argv.
     * @param {String} input The input string that will be passed to minimist.
     *                       It is a command line sentence.
     * @return {Array<String>} argv The standard minimist output.
     * @example
     * const parseSentence = require('./modules/argsplitter.js');
     *
     * console.log(parseSentence('foo --bar "Hello, world!"');
     *
     * // Logs ["foo", "--bar", "Hello, World!"]
     */
    module.exports = function(input) {
        var argv;
        /**
         * First we need to determine if there are any quotes on the sentence, because if there aren't,
         * that's pretty fucking cool, we don't need to do anything. The problem comes when there are,
         * because just doing a simple .split(' ') won't work with the following sentence:
         *
         * The argv would look like this:
         * foo -b "this is a string"
         *
         *
         * argv._ = ['foo', 'is', 'a', 'string'];
         * argv.b = '"this';
         *
         * The solution would be to give minimist the following input:
         *
         * ['foo', '-b', '"this is a string"']
         *
         * Now that would give us the argv we want:
         *
         * argv._ = ['foo'];
         * argv.b = 'this is a string';
         *
         * How do we do it, then? We split the sentence into a "wrongPieces" array that would give us
         * the wrong output, and we keep iterating over it. If there's no unclosed quote, we put each
         * piece into a "goodPieces" array. However, if we detect that a piece is part of a string, we
         * concatenate it to the last element of "goodPieces" instead of creating a new element.
         *
         * Then we give the "goodPieces" array to minimist and return the result.
         * There we go, problem solved.
         */
        if (input.includes('"') || input.includes('\'')) {
            /**
             * Counts the number of unescaped quotes that the piece has.
             * @private
             * @param  {String} piece      The piece to evaluate.
             * @param  {String} quoteChar The quote character, either " or '.
             * @return {Number}            The number of unescaped quotes.
             */
            var countQuotes = function(piece, quoteChar) {
                // Matches everything that is not a quote or \
                var regex = new RegExp("[^" + quoteChar + "\\\\]", 'g');
                // Remove eveything that is not quote or \
                var replaced = piece.replace(regex, '');
                // Remove escaped quotes, then remove all remaining slashes, then count.
                return replaced.replace(
                    new RegExp('(\\\\' + quoteChar + ')', 'g'), ''
                ).replace(
                    /\\/g, ''
                ).length;
            };

            /**
             * Finds whether or not the piece has any unescaped quotes
             * @private
             * @param  {String} piece      The piece to evaluate.
             * @param  {String} quoteChar The quote character, either " or '.
             * @return {Boolean}           True if it does, false if it doesn't.
             */
            var hasQuote = function(piece, quoteChar) {
                return countQuotes(piece, quoteChar) > 0;
            };

            /**
             * Splits a piece that has three or more quotes into a string with the two first quotes
             * (and therefore, the first full string), and a string with the rest of the piece
             * @private
             * @param  {String} piece      The piece to evaluate.
             * @param  {String} quoteChar The quote character, either " or '.
             * @return {Array}             An array with element 0 being the first part and element 1
             *                             being the second.
             *
             * @example
             * splitPiece('"Hello""World!', '"'); // 0: '"Hello"'
             *                                    // 1: '"World!'
             */
            var splitPiece = function(piece, quoteChar) {
                var firstQIndex = getFirstQuote(piece, quoteChar);
                var secondQIndex = getFirstQuote(piece, quoteChar, firstQIndex + 1);

                var firstPart = piece.substring(
                    0, secondQIndex + 1
                );
                var secondPart = piece.substring(
                    secondQIndex + 1, piece.length
                );

                return [firstPart, secondPart];
            };

            /**
             * Returns the index of the first unescaped quote in the piece
             * @private
             * @param  {String} piece        The piece to evaluate.
             * @param  {String} quoteChar   The quote character, either " or '.
             * @param  {Number} [position=0] Where to begin looking in the string
             * @return {Number}              The index of the first quote.
             */
            var getFirstQuote = function(piece, quoteChar, position = 0) {
                var i = position - 1; //-1 because we're incrementing it
                do {
                    i = piece.indexOf(quoteChar, i + 1);
                } while (piece.charAt(i - 1) === '\\');
                return i;
            };

            /**
             * Detects strings in params and concatenates them into a single array element.
             * @private
             * @param {String[]} pieces    An array with every piece of the cli sentence. Initially,
             *                             this is sentence.split(' ');
             * @param  {String} quoteChar The quote character, either " or '.
             * @returns {Array}            The array with concatenated strings.
             */
            var solveQuotes = function(pieces, quoteChar) {
                var unclosedQuote = false;
                var result = [];
                for (var i = 0; i < pieces.length; i++) {
                    if (unclosedQuote) {
                        // Two scenarios. Either we have a closing quote or we don't.
                        if (hasQuote(pieces[i], quoteChar)) {
                            // If it does, then there are two scenarios again:
                            // Either the closing quote is the last character,
                            // or there is text after it.
                            var qIndex = getFirstQuote(pieces[i], quoteChar);
                            if (qIndex !== (pieces[i].length - 1)) {
                                // The closing quote is not the last character; there's text after it.
                                // We take that text and put it on the next piece.
                                pieces[i + 1] =
                                    pieces[i].substring(qIndex + 1, pieces[i].length) +
                                    (typeof pieces[i + 1] !== 'undefined' ?
                                        pieces[i + 1] : '');
                                pieces[i] = pieces[i].substring(0, qIndex + 1);
                            }

                            // Now the two scenarios are reduced to one. The last character of the
                            // current piece will always be the last. We can now conclude that the
                            // unclosed quote is now closed.
                            result[result.length - 1] =
                                result[result.length - 1] + ' ' + pieces[i];
                            unclosedQuote = false;
                        } else {
                            // We don't have a closing quote. That means that the current piece is part
                            // of the current string. So we concatenate it to the last piece in
                            // result
                            result[result.length - 1] =
                                result[result.length - 1] + ' ' + pieces[i];
                        }
                    } else {
                        // Two scenarios. Either we have an opening quote or we don't.
                        if (hasQuote(pieces[i], quoteChar)) {
                            // We have an opening quote.
                            // Three scenarios. We have one, two, or more than two
                            if (countQuotes(pieces[i], quoteChar) === 1) {
                                // We have just one opening quote. We can safely add this piece to the
                                // good pieces and carry on iterating. Any further pieces will be
                                // concatenated with this one until the unclosedQuote gets closed.

                                result.push(pieces[i]);
                                unclosedQuote = true;
                            } else if (countQuotes(pieces[i], quoteChar) === 2) {
                                // We have two quotes. However, we might have information after the
                                // closing quote that doesn't belong to the string, so we split:
                                var split = splitPiece(pieces[i], quoteChar);

                                // Both parts are safe to push, but we make sure that part 2 exists.
                                result.push(split[0]);
                                if (split[1] !== '') result.push(split[1]);
                            } else {
                                // We have more than three quotes. We split them. The first part of
                                // each split is always safe to store in result because it's a full
                                // closed string. The second part can be on any of the three scenarios:
                                // one, two or three quotes. So we keep iterating until it's on the
                                // first or on the second.
                                var next = pieces[i];
                                do {
                                    var split = splitPiece(next, quoteChar);
                                    result.push(split[0]);
                                    next = split[1];
                                } while (countQuotes(next, quoteChar) > 2);

                                // Now, the string that's left is in scenario 1 or 2.
                                // We follow the same procedure.
                                if (countQuotes(next, quoteChar) === 1) {
                                    result.push(next);
                                    unclosedQuote = true;
                                } else if (countQuotes(next, quoteChar) === 2) {
                                    result.push(next);
                                } else {
                                    // This shouldn't happen.
                                    throw new Error('I\'m sorry, but minimist-string has encountered' +
                                        'unexpected behaviour. This is porbably not your fault and' +
                                        'just a bug. Please report it with the stack trace on the' +
                                        'GitHub tracker.');
                                }
                            }
                        } else {
                            // We don't have a quote on this piece.
                            // We can safely move on to the next one.
                            result.push(pieces[i]);
                        }
                    }
                }
                return result;
            };

            var wrongPieces = input.split(' ');

            var goodPieces = solveQuotes(wrongPieces, '"');
            goodPieces = solveQuotes(goodPieces, '\'');

            /**
             * We're done! There's one little thing left though. The following sentence:
             *
             * --bar="This is a string"
             *
             * Would give:
             *
             * argv.bar = '"This is a string"'
             *
             * We want to get rid of the quotes. However, we want to keep escaped quotes.
             */
            var regexQuotes = /[\"\']/g;
            for (var i = 0; i < goodPieces.length; i++) {
                // Not using regex will only match the first occurence.
                goodPieces[i] = goodPieces[i].replace(/(\\\')/g, '%%%SINGLEQUOTE%%%');
                goodPieces[i] = goodPieces[i].replace(/(\\\")/g, '%%%DOUBLEQUOTE%%%');
                goodPieces[i] = goodPieces[i].replace(regexQuotes, '');
                goodPieces[i] = goodPieces[i].replace(/(%%%SINGLEQUOTE%%%)/g, '\'');
                goodPieces[i] = goodPieces[i].replace(/(%%%DOUBLEQUOTE%%%)/g, '\"');
            }

            argv = goodPieces;
        } else {
            argv = input.split(' ');
        }

        return argv;
    };
})();

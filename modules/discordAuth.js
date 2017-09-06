'use strict';

const META = {
    author: "Wolvan",
    name: "DiscordAuth",
    description: "Get a Discord Auth Token by providing Email and Password.",
    version: "1.0.0"
};

const Promise = require("bluebird");
const fs = require("fs");

function decodeToken(enc, pass) {
    try {
        var crypto = require("crypto");
        var decipher = crypto.createDecipher("aes-256-cbc", pass);
        var plain = decipher.update(enc, "hex", "utf8");
        plain += decipher.final("utf8");
        return plain;
    } catch (e) {
        return;
    }
}

function encodeToken(token, pass) {
    var crypto = require("crypto");
    var cipher = crypto.createCipher("aes-256-cbc", pass);
    var crypted = cipher.update(token, "utf8", "hex");
    crypted = crypted += cipher.final("hex");
    return crypted;
}


function getTokenFromEmailAndPassword(_email, _password) {
    return new Promise((resolve, reject) => {
        require("request").post(
            "https://discordapp.com/api/auth/login", { json: { email: _email, password: _password } },
            function(error, response, body) {
                if (!error && response.statusCode === 200) {
                    resolve(body.token);
                } else {
                    reject(error || body);
                }
            }
        );
    });
}

function getTokenFromCache(_email, _password) {
    return new Promise((resolve, reject) => {
        try {
            let eToken = fs.readFileSync("./tenc", "utf-8");
            fs.unlinkSync("./tenc");
            resolve(decodeToken(eToken, String(_email, _password)) || { code: "FAILEDDEC" });
        } catch (error) {
            reject(error);
        }
    });
}

function getToken(_email, _password, noCaching = false) {
    return new Promise((resolve, reject) => {
        if (noCaching) {
            getTokenFromEmailAndPassword(_email, _password).then((token) => {
                resolve(token);
            }).catch((error) => {
                reject(error);
            });
        } else {
            getTokenFromCache(_email, _password).then((token) => {
                fs.writeFileSync("./tenc", encodeToken(token, String(_email + _password)));
                resolve(token);
            }).catch((err) => {
                getTokenFromEmailAndPassword(_email, _password).then((token) => {
                    fs.writeFileSync("./tenc", encodeToken(token, String(_email + _password)));
                    resolve(token);
                }).catch((error) => {
                    reject({
                        error1: err,
                        error2: error
                    });
                });
            });
        }
    });
}

module.exports = getToken;
module.exports.encodeToken = encodeToken;
module.exports.decodeToken = decodeToken;
module.exports.META = META;

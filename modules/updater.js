'use strict';

const META = {
    author: "Wolvan",
    name: "Updater",
    description: "Module that allows checking for version updates by fetching a JSON file with version data.",
    version: "1.0.0"
};

const request = require("request");
const semver = require("semver");
const ExtendableError = require("./extendableError.js");

const localVersions = new WeakMap();
const remoteVersions = new WeakMap();
const remoteChangelog = new WeakMap();
const urls = new WeakMap();
const useragents = new WeakMap();

class InvalidURLError extends ExtendableError {
    constructor(URL) {
        super(`"${URL}" is not a valid URL. Provide a JSON file to fetch the remote version from.`);
    }
};
class InvalidSemverFormatError extends ExtendableError {
    constructor(versionString) {
        super(`"${versionString}" is not a valid SemVer version string!`);
    }
}

function getVersionFromPackageJSON() {
    var packageJSON;
    try {
        packageJSON = require("./package.json");
        return packageJSON.version;
    } catch (error) {
        try {
            packageJSON = require("../package.json");
            return packageJSON.version;
        } catch (error) {
            return null;
        }
    }
}

class Updater {
    constructor(URL, localVersion, userAgent = `${META.author}/${META.name} ${META.version}`) {
        if (!URL) throw new InvalidURLError(URL);
        urls.set(this, URL);
        useragents.set(this, userAgent);
        var versionString = localVersion || getVersionFromPackageJSON();
        var version = semver.parse(versionString);
        if (!version) throw new InvalidSemverFormatError(versionString);
        localVersions.set(this, versionString);
    }

    fetchUpdateData() {
        return new Promise((resolve, reject) => {
            request({
                url: urls.get(this),
                headers: {
                    'User-Agent': useragents.get(this)
                }
            }, (error, response, body) => {
                if (error || response.statusCode !== 200) {
                    reject({ error: error, response: response, type: "REQUEST" });
                } else {
                    try {
                        var updateData = JSON.parse(body);
                        var vTag;
                        if (typeof updateData === "string") vTag = updateData;
                        else vTag = updateData.tag_name;
                        if (semver.parse(vTag)) {
                            remoteVersions.set(this, vTag);
                            remoteChangelog.set(this, updateData.body);
                            resolve({ version: vTag, changelog: updateData.body || "N/A" });
                        } else {
                            reject({ error: new InvalidSemverFormatError(vTag), type: "SEMVERFORMAT" });
                        }
                    } catch (err) {
                        reject({ error: err, type: "JSONPARSE" });
                    }
                }
            });
        });
    }

    isUpdateAvailable(local, remote) {
        var lV = local || localVersions.get(this);
        var rV = remote || remoteVersions.get(this);
        if (!lV || !rV || !semver.parse(lV) || !semver.parse(rV)) throw new InvalidSemverFormatError(lV || rV);
        return semver.satisfies(rV, `>${lV} ^${lV}`);
    }

    isUpgradeAvailable(local, remote) {
        var lV = local || localVersions.get(this);
        var rV = remote || remoteVersions.get(this);
        if (!lV || !rV || !semver.parse(lV) || !semver.parse(rV)) throw new InvalidSemverFormatError(lV || rV);
        return semver.gtr(rV, `>${lV} ^${lV}`);
    }

    checkUpdate() {
        return new Promise((resolve, reject) => {
            this.fetchUpdateData().then(() => {
                resolve({ newerVersion: this.isUpdateAvailable() || this.isUpgradeAvailable(), type: this.isUpgradeAvailable() ? "UPGRADE" : "UPDATE" });
            }).catch((err) => {
                reject(err);
            });
        });
    }

    getLatestVersion() {
        return remoteVersions.get(this);
    }
    getLatestChangelog() {
        return remoteChangelog.get(this) || "N/A";
    }
}

module.exports = Updater;
module.exports.InvalidURLError = InvalidURLError;
module.exports.InvalidSemverFormatError = InvalidSemverFormatError;
module.exports.META = META;

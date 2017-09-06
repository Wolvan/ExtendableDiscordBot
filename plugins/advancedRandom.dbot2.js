"use strict";

var api;

const magicNumber = 33;
const randomSettingsWM = new WeakMap();

const generatorFunctionsBase = {
    seeded: {
        "sin100k": function (seed) {
            var x = Math.sin(seed) * 100000;
            return x - Math.floor(x);
        },
        "sin10k": function (seed) {
            var x = Math.sin(seed) * 10000;
            return x - Math.floor(x);
        },
        "sinmodulo/sinabs": (seed) => ((Math.abs(Math.sin(seed)) * 100000) % 1),
        "invertedbell/invertedbellcurve": (seed) => ((Math.cos(seed) * 0.5) + 0.5)
    },
    unseeded: {
        "vanilla": () => Math.random(),
        "bell/bellcurve/gauss/gaussian/gaussiancurve": () => ((Math.random() + Math.random() + Math.random()) / 3)
    }
};
var generatorFunctions = Object.assign(expand(generatorFunctionsBase.seeded), expand(generatorFunctionsBase.unseeded));

function expand(_obj) {
    let obj = Object.assign({}, _obj);
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; ++i) {
        let key = keys[i],
            subkeys = key.split(/\//),
            target = obj[key];
        delete obj[key];
        subkeys.forEach((key) => obj[key] = target);
    }
    return obj;
}

function stringToIntHash(str) {
    var hash = magicNumber * Math.random();
    for (let i = 0; i < str.length; i++) {
        let char = str.charCodeAt(i);
        hash = ((hash << 5) + hash) + char; /* hash * 33 + c */
    }
    return hash;
}

class AdvancedRandom {
    get availableGenerators() {
        return Object.keys(generatorFunctions);
    }
    get generatorNames() {
        return {
            seeded: Object.keys(generatorFunctionsBase.seeded),
            unseeded: Object.keys(generatorFunctionsBase.unseeded)
        };
    }

    get generator() {
        return randomSettingsWM.get(this).generator;
    }
    set generator(generator) {
        if (this.availableGenerators.includes(generator.toLowerCase())) randomSettingsWM.get(this).generator = generator.toLowerCase();
        else throw new Error("Generator function not registered");
    }

    constructor(generator = "vanilla", seed = Math.random() * magicNumber) {
        var randomSettings = {};
        if (typeof seed === "string") seed = stringToIntHash(seed);
        if (typeof seed !== "number") throw new Error("Advanced Random Seed needs to be a String or a Number");
        randomSettings.seed = seed;
        if (this.availableGenerators.includes(generator.toLowerCase())) randomSettings.generator = generator.toLowerCase();
        else randomSettings.generator = "vanilla";
        console.log("New AdvancedRandom created with generator '" + randomSettings.generator + "'");
        randomSettingsWM.set(this, randomSettings);
    }

    random() {
        let randFunc = generatorFunctions[randomSettingsWM.get(this).generator];
        return (randFunc ? randFunc(++randomSettingsWM.get(this).seed) : NaN);
    }

    reseed(seed = Math.random() * magicNumber) {
        if (typeof seed === "string") seed = stringToIntHash(seed);
        if (typeof seed !== "number") throw new Error("Advanced Random Seed needs to be a String or a Number");
        randomSettingsWM.get(this).seed = seed;
    }
}

module.exports = {
    metaInf: {
        name: "Advanced Random",
        version: "1.0.0",
        description: "More (seedable) random number generation",
        author: "Wolvan & Doxel",
        apiVersionRequired: "^2.0.0",
    },
    load: function (_api) {
        api = _api;
    },
    AdvancedRandom: AdvancedRandom,
    registerAlgorithm: function (name, func, unseeded = false) {
        if (typeof name !== "string" || !name || typeof func !== "function") return false;
        let generatorsObject = generatorFunctionsBase[unseeded ? "unseeded" : "seeded"];
        if (generatorsObject[name]) return false;
        generatorsObject[name.toLowerCase()] = func;
        generatorFunctions = Object.assign(expand(generatorFunctionsBase.seeded), expand(generatorFunctionsBase.unseeded));
        api.events.emit("randomAlgorithmRegistered", name);
        return true;
    },
    isAlgorithmRegistered: function (name) {
        if (typeof name !== "string" || !name) return false;
        return !!generatorFunctions[name.toLowerCase()];
    },
    unregisterAlgorithm: function (name, unseeded = false) {
        if (typeof name !== "string" || !name) return false;
        let generatorsObject = generatorFunctionsBase[unseeded ? "unseeded" : "seeded"];
        if (!generatorsObject[name]) return false;
        delete generatorsObject[name.toLowerCase()];
        generatorFunctions = Object.assign(expand(generatorFunctionsBase.seeded), expand(generatorFunctionsBase.unseeded));
        api.events.emit("randomAlgorithmUnregistered", name);
        return true;
    }
};

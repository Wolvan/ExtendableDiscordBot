"use strict";

var api;
var storage;

const defaultDie = "1d20";
const diceStorageKey = "channelDice";
const generatorKey = "generators";

var dDice;
var rollCommand;

var randomFunctionNamespace = Math;

function sanitize(str) {
    return str.replace(/[^d\d\+-g]/gi, "").replace(/([+-])[+-]*/g, "$1"); // Filter anything that is not valid in a dice String
}

function hookAR() {
    console.log("AdvancedRandom found! Switching to advanced random number generation");
    let AdvancedRandomPlugin = api.pluginManager.getPlugin("advancedRandom");
    randomFunctionNamespace = new AdvancedRandomPlugin.AdvancedRandom();
}

function handleLoad(fileID) {
    if (fileID === "advancedRandom" + api.config.pluginFileExt) {
        hookAR();
    }
}

function getDefaultDice() {
    return defaultDie;
}

function getDice(channelID) {
    return (dDice[channelID] || defaultDie);
}

function setDice(channelID, diceString) {
    if (diceString && sanitize(diceString)) {
        dDice[channelID] = sanitize(diceString);
        storage.setItem(diceStorageKey, dDice);
        return true;
    } else {
        delete dDice[channelID];
        storage.setItem(diceStorageKey, dDice);
        return false;
    }
}


function checkVerbose(str) {
    if (str) {
        switch (str.toLowerCase()) {
            case "verbose":
            case "ver":
            case "all":
            case "full":
                return true;
            default:
                return false;
        }
    }
    return false;
}

function removeSmallest(arr) {
    var min = 0;
    for (var i = 1; i < arr.length; i++) {
        if (arr[i] < arr[min]) min = i;
    }
    arr.splice(min, 1);
    return arr;
}

function initCommands() {
    rollCommand = api.commands.addCommand("roll", "Rolls [x] number of [y] sided dice with a [z] modifier").setSyntax("roll [x]d[y]+z").setFunction(function (data) {
        if (randomFunctionNamespace !== Math) {
            try {
                randomFunctionNamespace.generator = ((storage.getItemSync(generatorKey) || {})[data.channelID] || "vanilla");
            } catch (error) {
                api.message.send(data.channelID, "Error setting generator: " + error.message + ". Using vanilla generator instead.");
                randomFunctionNamespace.generator = "vanilla";
            }
        }

        var instancedDefault = defaultDie;

        if (dDice[data.channelID] && !isNaN(dDice[data.channelID].charAt(0))) {
            instancedDefault = dDice[data.channelID];
        }

        var arg1 = data.args[0] || "";

        var dieString = arg1 || "";
        var repeatCount = 1;
        var messages = [];

        if (dieString && dieString.match(/x\d+$/)) {
            repeatCount = parseInt(dieString.match(/x(\d+)$/)[1]);
            dieString = dieString.replace(/x(\d+)$/, "");
            if (repeatCount > 100) {
                api.message.send(data.channelID, "The number of repeates are too high. Max is 100");
                return;
            }
        }

        dieString = sanitize(dieString);

        if (!dieString) dieString = "[" + (dDice[data.channelID] || defaultDie) + "]";
        dieString = dieString.replace("[", "").replace("]", "");

        if (dieString.charAt(0) === "+" || dieString.charAt(0) === "-") dieString = instancedDefault + dieString;

        dieString = sanitize(dieString);
        if (isNaN(dieString.charAt(0))) dieString = instancedDefault;

        var dicesplit1 = dieString.replace(/-/g, ",-").split("+");
        var dice = [];
        dicesplit1.forEach(function (item) {
            item.split(",").forEach(function (item2) {
                dice.push(item2);
            });
        });

        for (var count = 0; count < repeatCount; count++) {

            var rolls = [];
            var times = 0;
            var die = 0;
            var i = 0;
            var isNegative = false;
            var roll = 0;
            var modifiers = [];
            var dieTooHigh = false;
            var useGFW = (data.args[1] && data.args[1].toLowerCase() === "gwf");
            var gfwReplaced = 0;

            dice.forEach(function (item) {
                if (!item) return;
                if (dieTooHigh) return;
                if (item.indexOf("d") !== -1) {
                    isNegative = false;
                    if (item.indexOf("-") !== -1) {
                        isNegative = true;
                        item = item.replace(/-/g, "");
                    }
                    times = parseInt(item.split("d")[0]);
                    die = parseInt(item.split("d")[1]);
                    if (times > 10000 || die > 10000) {
                        dieTooHigh = true;
                    }
                    for (i = 0; i < times; i++) {
                        roll = Math.floor((randomFunctionNamespace.random() * die) + 1);
                        if ((useGFW || item.indexOf("g") !== -1) && (roll === 1 || roll === 2)) {
                            gfwReplaced++;
                            roll = Math.floor((randomFunctionNamespace.random() * die) + 1);
                        }
                        roll = isNegative ? -roll : roll;
                        rolls.push(roll);
                    }
                } else {
                    modifiers.push(parseInt(item));
                }
            });

            if (dieTooHigh) {
                api.message.send(data.channelID, "One or more of the dice are too high. Max is 10000d10000");
                return;
            }

            var sum = 0;
            var drolls = null;
            if (data.args[1] && data.args[1].toLowerCase() == "drop" && parseInt(data.args[2]) && parseInt(data.args[2]) < rolls.length && parseInt(data.args[2]) > 0) {
                drolls = rolls.slice();
                for (var rcount = 0; rcount < parseInt(data.args[2]); rcount++) {
                    drolls = removeSmallest(drolls);
                }
                drolls.forEach(function (item) {
                    sum += item;
                });
            } else {
                rolls.forEach(function (item) {
                    sum += item;
                });
            }

            modifiers.forEach(function (modifier) {
                sum += modifier;
            });
            var NaNCount = 0;
            rolls.forEach(function (item) {
                if (isNaN(item)) NaNCount++;
            });
            modifiers.forEach(function (item) {
                if (isNaN(item)) NaNCount++;
            });

            var msg = dieString + " =";

            if ((rolls.length <= 6 && rolls.length > 1) || modifiers.length || checkVerbose(data.args[1])) {
                msg += " {" + rolls.join("+") + "}" + (modifiers.length ? (" + " + modifiers.join("+")) : "");
                if (drolls) {
                    msg += " ==> {" + drolls.join("+") + "}" + (modifiers.length ? (" + " + modifiers.join("+")) : "");
                }
                msg += " =";
            }
            msg += " **" + sum + "**";

            msg = msg.replace(/\+-/g, "-");

            if (gfwReplaced) msg += " rerolled " + gfwReplaced;

            if (msg.length > 2000) msg = dieString + " = " + "{ Truncated because of character limit } = " + sum;
            messages.push(msg);
            if (NaNCount >= 16) {
                setTimeout(api.message.send.bind(this, data.channelID, "Batman!"), 4000);
            }
        }
        api.message.send(data.channelID, messages.join("\n"));
    });
    rollCommand.addCommand("set", "Set or reset default dice for this channel", "o").setSyntax("set [diceString]").setFunction(function (data) {
        api.message.send(data.channelID, (setDice(data.channelID, data.args[0]) ? "Set" : "Reset") + " default dice to [" + getDice(data.channelID) + "]");
    });
    rollCommand.addCommand("get", "Get the currently set dice").setFunction(function (data) {
        let message = [
            "Current default dice for this channel are [" + getDice(data.channelID) + "]",
        ];
        if (randomFunctionNamespace !== Math)
            message.push("Using AdvancedRandom v" + api.pluginManager.getPluginInfo("advancedRandom").Version + " with algorithm `" + ((storage.getItemSync(generatorKey) || {})[data.channelID] || "vanilla") + "`");
        api.message.send(data.channelID, message.join("\n"));
    });
    rollCommand.addCommand("help", "", ["?"]).setFunction(function (data) {
        api.message.send(data.channelID, rollCommand.getHelp());
    });
    rollCommand.addCommand("reseed", "Reseed the random number generation", [], "o").setFunction(function (data) {
        if (randomFunctionNamespace !== Math) {
            randomFunctionNamespace.reseed();
            api.message.send(data.channelID, "Reseeding completed successfully!");
        } else api.message.send(data.channelID, "Not using AdvancedRandom! Can't reseed!");
    });
    rollCommand.addCommand("setgenerator", "Set the AdvancedRandom generator", [], "o").setFunction(function (data) {
        if (!data.args[0] || typeof data.args[0] !== "string") {
            api.message.send(data.channelID, "You need to specify a name of the generator you want to use");
            return;
        }
        if (randomFunctionNamespace !== Math) {
            try {
                randomFunctionNamespace.generator = data.args[0];
                let generators = (storage.getItemSync(generatorKey) || {});
                generators[data.channelID] = data.args[0].toLowerCase();
                storage.setItem(generatorKey, generators);
                api.message.send(data.channelID, "Successfully changed generator for this channel to `" + randomFunctionNamespace.generator + "`");
            } catch (error) {
                api.message.send(data.channelID, "Error setting generator: " + error.message);
            }
        } else api.message.send(data.channelID, "Not using AdvancedRandom! Can't set generator!");
    });
    rollCommand.addCommand("getgenerators", "Get a list of available AR generators").setFunction(function (data) {
        if (randomFunctionNamespace !== Math) api.message.send(data.channelID,
            "Available generators:\n" +
            "Seeded: " + randomFunctionNamespace.generatorNames.seeded.join(", ") + "\n" +
            "Unseeded: " + randomFunctionNamespace.generatorNames.unseeded.join(", ")
        );
        else api.message.send(data.channelID, "Not using AdvancedRandom. Only vanilla Math.random() can be used");
    });
}

module.exports = {
    metaInf: {
        name: "Roll the dice",
        version: "2.2.0",
        description: "A simple dice rolling plugin.",
        author: "Wolvan",
        pluginDependencies: {
            "advancedRandom": {
                state: "loaded",
                version: "^1.0.0",
                optional: true
            }
        }
    },
    load: function (_api, _storage) {
        api = _api;
        storage = _storage;
        dDice = storage.getItemSync(diceStorageKey) || {};

        if (api.pluginManager.isPluginLoaded("advancedRandom")) {
            hookAR();
        }

        api.pluginManager.events.on("pluginStarted", handleLoad);
    },
    start: function () {
        initCommands();
    },
    stop: function () {
        if (rollCommand) rollCommand.delete();
    },
    getDice: getDice,
    getDefaultDice: getDefaultDice,
    setDice: setDice,
    getGenerator: function (channelID) {
        return ((storage.getItemSync(generatorKey) || {})[channelID] || "vanilla");
    },
    setGenerator: function (channelID, generator) {
        if (randomFunctionNamespace !== Math) {
            try {
                let generators = (storage.getItemSync(generatorKey) || {});
                generators[channelID] = generator.toLowerCase();
                storage.setItem(generatorKey, generators);
                return randomFunctionNamespace.generator;
            } catch (error) {
                throw error;
            }
        } else return false;
    },
    isAdvancedRandom: () => randomFunctionNamespace !== Math
};

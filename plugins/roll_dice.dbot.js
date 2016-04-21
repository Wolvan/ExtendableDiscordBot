var api;
function handleCommands(data) {
    if (data.cmd === "roll") {
        var dieString = data.args[0];
        if (!dieString) dieString = "[1d20]";
        dieString = dieString.replace("[", "").replace("]", "");
        
        if (dieString === "?") {
            api.Messages.send("Roll dice! Format: [xdy+/-xdy+/-xdy+/-xdy+/-...+/-z]. Max x: 200, Max y: 200");
            return;
        }
        
        var dicesplit1 = dieString.replace(/-/g, ",-").split("+");
        var dice = [];
        dicesplit1.forEach(function (item) {
            item.split(",").forEach(function (item2) {
                dice.push(item2);
            });
        })
        var rolls = [];
        var times = 0;
        var die = 0;
        var i = 0;
        var isNegative = false;
        var roll = 0;
        var modifiers = [];
        var dieTooHigh = false;
        
        dice.forEach(function (item) {
            if (dieTooHigh) return;
            if (!item) return;
            if (item.indexOf("d") !== -1) {
                isNegative = false;
                if (item.indexOf("-") !== -1) {
                    isNegative = true;
                    item = item.replace(/-/g, "");
                }
                times = parseInt(item.split("d")[0]);
                die = parseInt(item.split("d")[1]);
                if (times > 200 || die > 200) {
                    dieTooHigh = true;
                    return;
                }
                for (i = 0; i < times; i++) {
                    roll = Math.floor((Math.random() * die) + 1);
                    roll = isNegative ? -roll : roll;
                    rolls.push(roll);
                }
            } else {
                modifiers.push(parseInt(item));
            }
        });
        
        if (dieTooHigh) {
            api.Messages.send(data.channelID, "One or more of the dice you tried to throw are too high! Max is 200d200.");
            return;
        }
        
        var sum = 0;
        rolls.forEach(function (item) { sum += item; });
        modifiers.forEach(function (modifier) {
            sum += modifier;
        });
		var NaNCount = 0;
		rolls.forEach(function(item) {if (isNaN(item)) NaNCount++;});
		modifiers.forEach(function(item) {if (isNaN(item)) NaNCount++;});
        var msg = " { " + rolls.join(" + ") + " }" + (modifiers.length ? (" + " + modifiers.join(" + ")).replace(/\+ -/g, "- ") : "") + " = " + sum;
        api.Messages.send(data.channelID, msg);
		if (NaNCount >= 16) {
			setTimeout(api.Messages.send.bind(this, data.channelID, "Batman!"), 4000);
		}
    }
}

module.exports = {
    meta_inf: {
        name: "Roll the dice",
        version: "1.1.0",
        description: "A simple dice rolling plugin.",
        author: "Wolvan"
    },
    load: function (_api) {
        api = _api;
    },
    start: function () {
        api.Events.on("chatCmd", handleCommands);
    },
    stop: function () {
        api.Events.removeListener("chatCmd", handleCommands);
    }
}

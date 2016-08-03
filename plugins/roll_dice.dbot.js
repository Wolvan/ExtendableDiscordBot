var api;
var defaultDie = "1d20";
var dDice = {};

function handleCommands(data) {
    if (data.cmd === "roll") {
	if (data.args[0] && data.args[0].toLowerCase() === "set") {
		var dDie = data.args[1];
		if (dDie) {
			dDice[data.channelID] = dDie;
		} else {
			dDice[data.channelID] = defaultDie;
		}
		api.Messages.send(data.channelID, "Set default die to [" + dDice[data.channelID] + "]");
		return;
	}
	if (data.args[0] && data.args[0].toLowerCase() === "get") {
		api.Messages.send(data.channelID, "Current default die is [" + (dDice[data.channelID] || defaultDie) + "]");
		return;
	}
        var dieString = data.args[0];
        if (!dieString) dieString = "[" + (dDice[data.channelID] || defaultDie) + "]";
        dieString = dieString.replace("[", "").replace("]", "");
	if(dieString.charAt(0) === "+" || dieString.charAt(0) === "-") dieString = (dDice[data.channelID] || defaultDie) + dieString;
	if(dieString.charAt(0).toLowerCase() === "x") {
		var repeatCount = Math.abs(parseInt(dieString.substring(1)));
		if (repeatCount > 1000) {
			api.Messages.send(data.channelID, "Repeat count has to be below 1000");
			return;
		}
		dieString = ((dDice[data.channelID] || defaultDie) + "+").repeat(repeatCount);
	}
	if(isNaN(dieString.charAt(0))) dieString = (dDice[data.channelID] || defaultDie);

	if (dieString === "?") {
		api.Messages.send(data.channelID, "Roll dice! Format: [xdy+/-xdy+/-xdy+/-xdy+/-...+/-z]. Max: 10000d10000.");
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
		api.Messages.send(data.channelID, "One or more of the dice are too high. Max is 10000d10000");
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
	var msg = " { " + rolls.join(" + ") + " }" + (modifiers.length ? (" + " + modifiers.join(" + ")) : "") + " = " + sum;
	msg = msg.replace(/\+ -/g, "- ");
	if (msg.length > 2000) msg = "{ Truncated because of character limit } = " + sum;
		api.Messages.send(data.channelID, msg);
		if (NaNCount >= 16) {
			setTimeout(api.Messages.send.bind(this, data.channelID, "Batman!"), 4000);
		}
	}
}

module.exports = {
    meta_inf: {
        name: "Roll the dice",
        version: "1.2.0",
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

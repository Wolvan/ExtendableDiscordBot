"use strict";

var api;
var command;

module.exports = {
    metaInf: {
        name: "Credits",
        version: "1.0.0",
        description: "Self advertisement is best advertisement",
        author: "Wolvan",
        apiVersionRequired: "^2.0.0",
    },
    load: function (_api) {
        api = _api;
    },
    start: function () {
        command = api.commands.addCommand("about", "Show bot creator information", ["credits"]).setFunction(function (data) {
            api.message.send(data.channelID, [
                "**Extendable Discord Bot v" + require("../package.json").version + "**",
                "A hackable, extendable Discord bot with a powerful plugin API written in NodeJS.",
                " ",
                "You want a bot but all those bots in existence don't fit your server or you'd need to add a bunch of them to get all the functions you want?",
                "This bot could be your answer. Write plugins (or have them written for you), place them in the plugins folder and load them.",
                "JS is a simple language to pick up and with this bot core, the sky is the limit for functionality.",
                " ",
                "Interested? Check out the project on Github https://github.com/NodeJSBots/ExtendableDiscordBot, write a plugin or two and truly unleash this bot's power!"
            ].join("\n"));
        });
        api.client.setPresence({
            game: {
                name: api.config.commandPrefix + "about for bot info",
                type: 0
            }
        });
    },
    stop: function () {
        if (command) command = command.delete();
        api.client.setPresence({
            game: null
        });
    }
};

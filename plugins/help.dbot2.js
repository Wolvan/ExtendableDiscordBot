"use strict";

var api;
var helpCommand;

module.exports = {
    metaInf: {
        name: "Help",
        version: "2.1.0",
        description: "Add a help command to show full help",
        author: "Wolvan",
        apiVersionRequired: "^2.0.0"
    },
    load: function (_api) {
        api = _api;
    },
    start: function () {

        helpCommand = api.commands.addCommand("help").setFunction(function (data) {
            if (data.args[0] && api.commands.getCommand(data.args[0])) {
                api.message.send(data.channelID, api.commands.getCommand(data.args[0]).getHelp());
                return;
            }
            api.message.send(data.channelID, api.message.chunkify(Object.keys(api.commands.getCommands()).map((item) => api.commands.getCommands()[item]).filter(object => {
                let permObject = {
                    command: object.command,
                    args: [],
                    userID: data.userID,
                    channelID: data.channelID,
                    serverID: data.serverID,
                    verbose: false
                };
                if (object.command.getPermission().constructor === Function && object.command.getPermission()(permObject))
                    return true;
                else if (object.command.getPermission().constructor !== Function && api.permission.__checkFunction(permObject))
                    return true;
                return false;
            }).filter(object => {
                return object.description;
            }).map(object => {
                return object.command.getSelfCommand() + " - " + object.description;
            }).sort()), true);
        });
    },
    stop: function () {
        if (helpCommand) helpCommand.delete();
    },

};

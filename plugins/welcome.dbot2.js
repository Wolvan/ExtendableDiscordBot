"use strict";

const keyCustomServers = "customServers";
const aliasPluginName = "managerAlias";

const defaultJoin = "%USER has joined the server!";
const defaultLeave = "%USER has left the server.";

var api;
var storage;

var alias = {
    getName: function (str) {
        return str;
    }
};

var customServers;
var command;

function setServer(channelID) {
    var serverID = api.channel.getServer(channelID);

    if (!customServers[serverID]) {
        customServers[serverID] = {
            channel: serverID,
            welcome: defaultJoin,
            leave: defaultLeave,
            disabled: false
        };
    }
}

function setProp(channelID, prop, value) {
    customServers[api.channel.getServer(channelID)][prop] = value;
    storage.setItem(keyCustomServers, customServers);
}

function initCommand() {
    command = api.commands.addCommand("welcome", "Manage Welcome and Leave messages").setFunction(function (data) {
        api.message.send(data.channelID, this.getHelp());
    });

    command.addCommand("help", "Show help for this command", ["?"]).setFunction(function () {
        command.apply(command, arguments);
    });

    command.addCommand("enable", "Enable welcome and leave messages for this server", ["on"]).setFunction(function (data) {
        setServer(data.channelID);
        setProp(data.channelID, "disabled", false);
        api.message.send(data.channelID, "The welcome and leaving messages have been **enabled** for this server.");
    });
    command.addCommand("disable", "Enable welcome and leave messages for this server", ["off"]).setFunction(function (data) {
        setServer(data.channelID);
        setProp(data.channelID, "disabled", true);
        api.message.send(data.channelID, "The welcome and leaving messages have been **disabled** for this server.");
    });

    command.addCommand("welcome", "Get or set welcoming message").setSyntax("welcome [Welcome Message]").setFunction(function (data) {
        setServer(data.channelID);
        if (data.simpleArgs[0]) {
            let msg = data.simpleArgs.join(" ");
            setProp(data.channelID, "welcome", msg);
            api.message.send(data.channelID, "The welcome message has been changed! It is now `" + customServers[api.channel.getServer(data.channelID)].welcome + "`");
        } else {
            api.message.send(data.channelID, "The current welcome message is: `" + customServers[api.channel.getServer(data.channelID)].welcome + "`");
        }
    });
    command.addCommand("leave", "Get or set leaving message").setSyntax("leave [Leave Message]").setFunction(function (data) {
        setServer(data.channelID);
        if (data.simpleArgs[0]) {
            let msg = data.simpleArgs.join(" ");
            setProp(data.channelID, "leave", msg);
            api.message.send(data.channelID, "The leave message has been changed! It is now `" + customServers[api.channel.getServer(data.channelID)].leave + "`");
        } else {
            api.message.send(data.channelID, "The current leave message is: `" + customServers[api.channel.getServer(data.channelID)].leave + "`");
        }
    });
    command.addCommand("channel", "Get or set the channel for welcome and leave messages").setSyntax("channel [Channel ID]").setFunction(function (data) {
        setServer(data.channelID);
        if (data.args[0]) {
            let channelID = data.args[0].replace(/[^\d]/g, "");
            if (channelID && api.channel.getServer(channelID) === api.channel.getServer(data.channelID)) {
                setProp(data.channelID, "channel", channelID);
                api.message.send(data.channelID, "Welcoming and leaving messages will now send on the #" + api.channelList[channelID].name + " channel");
            } else {
                api.message.send(data.channelID, "The specified channel is not part of this server!");
            }
        } else {
            api.message.send(data.channelID, "The current channel welcome and leaving messages will send to is #" + api.channelList[customServers[api.channel.getServer(data.channelID)].leave].name);
        }
    });
}


function handleJoin(data) {
    setServer(data.serverID);
    if (customServers[data.serverID].disabled) return;

    api.message.send(
        customServers[data.serverID].channel,
        customServers[data.serverID].welcome
            .replace(/%USER/g, "<@!" + data.member.id + ">")
            .replace(/%USERID/g, data.member.id)
            .replace(/%USERNAME/g, data.rawEvent.d.username)
    );
}

function handleLeave(data) {
    setServer(data.serverID);
    if (customServers[data.serverID].disabled) return;

    api.message.send(
        customServers[data.serverID].channel,
        customServers[data.serverID].leave
            .replace(/%USERID/g, data.member.id)
            .replace(/(%USERNAME|%USER)/g, data.rawEvent.d.user.username)
            .replace(/%USERNICK/g, data.member.nick || data.rawEvent.d.user.username)
            .replace(/%ALIASNAME/g, alias.getName(data.rawEvent.d.user.username))
    );
}


function handleLoad(fileID) {
    if (fileID.toLowerCase() === aliasPluginName + api.config.pluginFileExt)
        alias = api.pluginManager.getPlugin(aliasPluginName);
}

function handleUnload(fileID) {
    if (fileID.toLowerCase() === aliasPluginName + api.config.pluginFileExt)
        alias = {
            getName: function (str) {
                return str;
            }
        };
}

module.exports = {
    metaInf: {
        name: "Welcome",
        version: "2.0.0",
        description: "Greets or says goodbye to people",
        author: "Wolvan",
        apiVersionRequired: "^2.0.0"
    },
    load: function (_api, _storage) {
        api = _api;
        storage = _storage;

        customServers = storage.getItemSync(keyCustomServers) || {};

        if (api.pluginManager.isPluginLoaded(aliasPluginName)) {
            alias = api.pluginManager.getPlugin(aliasPluginName);
        }
        api.pluginManager.events.on("pluginLoaded", handleLoad);
        api.pluginManager.events.on("pluginUnloaded", handleUnload);
    },
    start: function () {
        initCommand();
        api.events.on("guildMemberAdd", handleJoin);
        api.events.on("guildMemberRemove", handleLeave);
    },
    stop: function () {
        if (command) {
            command.delete();
            command = null;
        }
        api.events.removeListener("guildMemberAdd", handleJoin);
        api.events.removeListener("guildMemberRemove", handleLeave);
    },
    unload: function () {
        api.pluginManager.events.removeListener("pluginLoaded", handleLoad);
        api.pluginManager.events.removeListener("pluginUnloaded", handleUnload);
    }
};

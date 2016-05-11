#!/usr/bin/env node
'use strict';

var appDir = require("path").dirname(require.main.filename);
process.chdir(appDir);

var commander = require("commander");
var EventEmitter = require("events");
var storage = require("node-persist");
var discord_io = require("discord.io");
var read = require("read");

var plugin_loader;
var discord;
var api = {};
var store = storage.create({ dir: process.cwd() + "/storage/main_app" });
store.initSync();

api.Events = new EventEmitter;
api.sharedStorage = storage.create({ dir: process.cwd() + "/storage/shared_storage" });
api.sharedStorage.initSync();

function initPluginLoader() {
    var loader_storage = storage.create({ dir: process.cwd() + "/storage/plugin_loader" });
    loader_storage.initSync();
    plugin_loader = require("./modules/plugin_loader.js"); plugin_loader = new plugin_loader(api, loader_storage);
    api.plugin_manager = {
        load: function (file_id, quiet) {
            console.log("[Plugin]Plugin requests loading of " + file_id);
            return plugin_loader.loadPlugin(file_id, quiet);
        },
        unload: function (file_id, quiet) {
            console.log("[Plugin]Plugin requests unloading of " + file_id);
            return plugin_loader.unloadPlugin(file_id, quiet);
        },
        start: function (file_id, quiet) {
            console.log("[Plugin]Plugin requests starting of " + file_id);
            return plugin_loader.startedPlugins(file_id, quiet);
        },
        stop: function (file_id, quiet) {
            console.log("[Plugin]Plugin requests stopping of " + file_id);
            return plugin_loader.stopPlugin(file_id, quiet);
        },
        listPlugins: function () {
            return plugin_loader.listPlugins();
        },
        getPlugin: function (fileID) {
            var plugin = Object.assign({}, plugin_loader.getPlugin(fileID));
            plugin.start = function () { console.log("Plugins are not allowed to call another plugin's start function!"); }
            plugin.stop = function () { console.log("Plugins are not allowed to call another plugin's stop function!"); }
            plugin.load = function () { console.log("Plugins are not allowed to call another plugin's load function!"); }
            plugin.unload = function () { console.log("Plugins are not allowed to call another plugin's unload function!"); }
            return plugin;
        },
        getPluginInfo: function (fileID) {
            return plugin_loader.getPluginInfo(fileID);
        },
        isPluginLoaded: function (fileID) {
            return plugin_loader.isPluginLoaded(fileID);
        },
        listLoadedPlugins: function () {
            return plugin_loader.getLoadedPlugins()
        },
        isPluginRunning: function (fileID) {
            return plugin_loader.isPluginRunning(fileID);
        },
        getStartedPlugins: function () {
            return plugin_loader.getStartedPlugins();
        }
    }
}

var manual_disconnect = false;
function retryConnection(nextTry) {
    if (!api.connected) api.connection.connect();
    api.connected = discord.connected;
    if (!api.connected) {
        setTimeout(retryConnection.bind(this, nextTry * 2), nextTry);
    }
}

function connectToDiscord() {
    discord = new discord_io({
        autorun: true,
        token: process.env.DISCORD_TOKEN,
        email: process.env.DISCORD_EMAIL,
        password: process.env.DISCORD_PASSWORD
    }).on("ready", function (rawEvent) {
        api.voiceChannel = null;
        api.client = {};
        api.client.username = discord.username;
        api.username = api.client.username;
        api.client.id = discord.id;
        api.client.email = discord.email;
        api.client.avatar_hash = discord.avatar;
        api.client.avatar = "https://cdn.discordapp.com/avatars/" + api.client.id + "/" + api.client.avatar_hash + ".jpg";
        api.client.presence = discord.presenceStatus;
        api.presence = api.client.presence;
        api.connected = discord.connected;
        api.client.directMessages = discord.directMessages;
        api.client.servers = discord.servers;
        api.servers = api.client.servers;
        api.Events.emit("ready");
        api.Events.emit("ready_raw", rawEvent);
        try {
            require.resolve("node-opus");
            api.canSendSound = true;
        } catch (e) {
            api.canSendSound = false;
        }
        api.connection = {
            connect: function () {
                discord.connect();
                api.connected = discord.connected;
            },
            disconnect: function () {
                manual_disconnect = true;
                discord.disconnect();
                api.connected = discord.connected;
            }
        };
        api.status = {
            setPresence: discord.setPresence,
            userInfo: {
                changeEmail: function (new_mail) {
                    discord.editUserInfo({
                        email: new_mail,
                        password: process.env.DISCORD_PASSWORD
                    });
                },
                changeUsername: function (new_name) {
                    discord.editUserInfo({
                        password: process.env.DISCORD_PASSWORD,
                        username: new_name
                    });
                },
                changeAvatar: function (icon) {
                    discord.editUserInfo({
                        avatar: icon,
                        password: process.env.DISCORD_PASSWORD
                    });
                },
                changeAvatarFromFile: function (file_path) {
                    discord.editUserInfo({
                        avatar: require("fs").readFileSync(file_path, "base64"),
                        password: process.env.DISCORD_PASSWORD
                    });
                }
            }
        };
        api.content = {
            sendMessage: discord.sendMessage,
            uploadFile: discord.uploadFile,
            getMessages: discord.getMessages,
            editMessage: discord.editMessage,
            simulateTyping: discord.simulateTyping,
            deleteMessage: discord.deleteMessage,
            fixMessage: discord.fixMessage
        };
        api.Messages = {
            sendMessage: discord.sendMessage,
            send: function (_to, _message) {
                discord.sendMessage({
                    to: _to,
                    message: _message,
                    tts: false,
                    typing: false
                });
                api.Events.emit("sendMessage", _to, _message);
            },
            sendTTS: function (_to, _message) {
                discord.sendMessage({
                    to: _to,
                    message: _message,
                    tts: true,
                    typing: false
                });
                api.Events.emit("sendTTSMessage", _to, _message);
            },
            uploadFile: api.content.uploadFile
        }
        api.sendMessage = api.Messages.send;
        api.sendTTSMessage = api.Messages.sendTTS;
        api.management = {
            createServer: function (options, callback) {
                discord.createServer(options, function (error, response) {
                    if (!error) api.Events.emit("createdDiscordServer", response);
                    if (callback) callback(error, response);
                });
            },
            deleteServer: function (options, callback) {
                discord.deleteServer(options, function (error, response) {
                    if (!error) api.Events.emit("deletedDiscordServer", options.server, response);
                    if (callback) callback(error, response);
                });
            },
            createChannel: function (options, callback) {
                discord.createChannel(options, function (error, response) {
                    if (!error) api.Events.emit("createdDiscordChannel", response);
                    if (callback) callback(error, response);
                });
            },
            deleteChannel: function (options, callback) {
                discord.deleteChannel(options, function (error, response) {
                    if (!error) api.Events.emit("deletedDiscordChannel", options.channel, response);
                    if (callback) callback(error, response);
                });
            },
            editChannelInfo: discord.editChannelInfo,
            acceptInvite: function (inviteCode, callback) {
                if (inviteCode.indexOf("/") !== -1) {
                    inviteCode = inviteCode.substring(inviteCode.lastIndexOf("/") + 1);
                }
                discord.acceptInvite(inviteCode, function (error, response) {
                    if (!error) api.Events.emit("joinedServer", response);
                    if (callback) callback(error, response);
                });
            },
            createInvite: discord.createInvite,
            roles: {
                createRole: discord.createRole,
                editRole: discord.editRole,
                deleteRole: discord.deleteRole,
                addToRole: discord.addToRole,
                removeFromRole: discord.removeFromRole
            },
            moderation: {
                kick: discord.kick,
                ban: discord.ban,
                unban: discord.unban,
                mute: discord.mute,
                unmute: discord.unmute,
                deafen: discord.deafen,
                undeafen: discord.undeafen
            }
        }
        api.roles = api.management.roles;
        api.moderation = api.management.moderation;
        api.voice = {
            joinChannel: function (channelID, callback) {
                discord.joinVoiceChannel(channelID, function () {
                    api.voiceChannel = channelID;
                    api.Events.emit("voiceChannelJoined", channelID);
                    if (callback) callback();
                });
            },
            leaveChannel: function (channelID, callback) {
                discord.leaveVoiceChannel(channelID, function () {
                    api.voiceChannel = null;
                    api.Events.emit("voiceChannelLeft", channelID);
                    if (callback) callback();
                });
            },
            getAudioContext: discord.getAudioContext
        }
        api.misc = {
            serverFromChannel: discord.serverFromChannel
        };
        // Load all Plugins in the ./plugins directory
        var quiet_loading = true;
        plugin_loader.listPlugins().forEach(function (item) {
            var plugin_state = plugin_loader.getInitialPluginState(item);
            if (plugin_state === "running" || plugin_state === "loaded") {
                plugin_loader.loadPlugin(item, quiet_loading);
            }
            if (plugin_state === "running") {
                plugin_loader.startPlugin(item, quiet_loading);
            }
        });
    }).on("message", function (_username, _userID, _channelID, _message, _rawEvent) {
        api.Events.emit("message_raw", _rawEvent);
        if (_userID === api.client.id) {
            api.Events.emit("selfMessage", {
                username: _username,
                userID: _userID,
                channelID: _channelID,
                message: discord.fixMessage(_message),
                msg: discord.fixMessage(_message),
                message_raw: _message,
                rawEvent: _rawEvent
            });
        } else {
            api.Events.emit("otherMessage", {
                username: _username,
                userID: _userID,
                channelID: _channelID,
                message: discord.fixMessage(_message),
                msg: discord.fixMessage(_message),
                message_raw: _message,
                rawEvent: _rawEvent
            });
        }
        if (_message.indexOf("<@" + api.client.id + ">") !== -1) {
            api.Events.emit("botMention", {
                username: _username,
                userID: _userID,
                channelID: _channelID,
                message: discord.fixMessage(_message),
                msg: discord.fixMessage(_message),
                message_raw: _message,
                rawEvent: _rawEvent
            });
            api.Events.emit("botMention_raw", _rawEvent);
        }
        if (_channelID === _userID) {
            api.Events.emit("directMessage", {
                username: _username,
                userID: _userID,
                channelID: _channelID,
                message: discord.fixMessage(_message),
                msg: discord.fixMessage(_message),
                message_raw: _message,
                rawEvent: _rawEvent
            });
        }
        api.Events.emit("message", {
            username: _username,
            userID: _userID,
            channelID: _channelID,
            message: discord.fixMessage(_message),
            msg: discord.fixMessage(_message),
            message_raw: _message,
            rawEvent: _rawEvent
        });
        var cmd_prefix = store.getItemSync("chat_command_prefix") || "!";
        if (_message.startsWith(cmd_prefix)) {
            var cmd_args = _message.split(" ");
            var cmd = cmd_args.splice(0, 1)[0].substring(1).toLowerCase();
            api.Events.emit("chatCmd", {
                cmd: cmd, 
                args: cmd_args,
                channelID: _channelID,
                username: _username,
                userID: _userID,
            });
            api.Events.emit("chatCmd#" + cmd, {
                args: cmd_args,
                channelID: _channelID,
                username: _username,
                userID: _userID,
            });
            api.Events.emit("chatCmd_raw", _rawEvent);
            api.Events.emit("chatCmd#" + cmd + "_raw", _rawEvent);
        }
    }).on("presence", function (_username, _userID, _status, _gameName, _rawEvent) {
        api.Events.emit("presence", {
            username: _username,
            userID: _userID,
            status: _status,
            game: _gameName,
            rawEvent: _rawEvent
        });
        api.Events.emit("presence_raw", _rawEvent);
    }).on("disconnected", function () {
        api.connected = discord.connected;
        api.Events.emit("disconnected");
        if (!manual_disconnect) {
            retryConnection(5000);
        } else {
            manual_disconnect = false;
        }
    }).on("debug", function (rawEvent) {
        api.Events.emit("debug", rawEvent);
    });
}

initPluginLoader();

// Load commandline args as env variables
commander.version("1.0.2").usage("[options]")
.option("-e, --email <Picarto Channel>", "Set the bots Login Username.")
.option("-p, --password <Bot name>", "Set the bot's Login Password.")
.option("-t, --token <Token>", "Use an already existing token to login.")
.parse(process.argv);
if (commander.token) process.env.DISCORD_TOKEN = commander.token;
if (commander.email) process.env.DISCORD_EMAIL = commander.email;
if (commander.password) process.env.DISCORD_PASSWORD = commander.password;

if (process.env.DISCORD_TOKEN) {
    console.log("Attempting token based connection, please be patient...");
    connectToDiscord();
} else if (process.env.DISCORD_PASSWORD && process.env.DISCORD_EMAIL) {
    console.log("Attempting to connect, this might take a moment. Please be patient...");
    connectToDiscord();
} else {
    console.log("No login information given.");
    function readEmail() {
        read({ prompt: "EMail: " }, function (err, email, isDefault) {
            if (!email) {
                readEmail();
                return;
            }
            process.env.DISCORD_EMAIL = email;
            readPassword();
        });
    }
    function readPassword() {
        read({ prompt: "Password: ", replace: "*", silent: true }, function (err, password, isDefault) {
            if (!password) {
                readPassword();
                return;
            }
            process.env.DISCORD_PASSWORD = password;
            connectToDiscord();
        });
    }
    readEmail();
}

function plugin_cmd(args) {
    var columnify = require("columnify");
    function printHelp() {
        var commands = {
            "list": "List status of all plugins",
            "load <filename>": "Load a plugin from the /plugins directory",
            "start <filename>": "Start a previously loaded plugin",
            "enable <filename>": "Loads and starts a plugin from the /plugins directory",
            "stop <filename>": "Stop a previously loaded plugin",
            "unload <filename>": "Unload a previously loaded plugin",
            "disable <filename>": "Stops and unloads a previously loaded plugin",
            "reload <filename>": "Fully reload a plugin (Stop->Unload->Load->Start)",
            "clearstorage <filename>": "Clear the Plugins storage. Plugin restarts in the process"
        }
        console.log(
            "\n" +
            "Plugin Loader Commands\n\n" +
            "\tUsage: plugins <subcommand> [arguments]\n\nSubcommands:\n" +
            columnify(commands, {
                columnSplitter: " - ",
                showHeaders: false
            })
        );
    }
    var subcmd = args.splice(0, 1)[0];
    if (subcmd) {
        switch (subcmd.toLowerCase()) {
            case "help":
                printHelp();
                break;
            case "load":
                var file_id = args.splice(0, 1)[0];
                if (file_id) {
                    plugin_loader.loadPlugin(file_id);
                } else {
                    console.log("No Plugin File specified!\n\n\tUsage: plugins load <File Name>\n");
                }
                break;
            case "unload":
                var file_id = args.splice(0, 1)[0];
                if (file_id) {
                    plugin_loader.unloadPlugin(file_id);
                } else {
                    console.log("No Plugin File specified!\n\n\tUsage: plugins unload <File Name>\n");
                }
                break;
            case "start":
                var file_id = args.splice(0, 1)[0];
                if (file_id) {
                    plugin_loader.startPlugin(file_id);
                } else {
                    console.log("No Plugin File specified!\n\n\tUsage: plugins start <File Name>\n");
                }
                break;
            case "stop":
                var file_id = args.splice(0, 1)[0];
                if (file_id) {
                    plugin_loader.stopPlugin(file_id);
                } else {
                    console.log("No Plugin File specified!\n\n\tUsage: plugins stop <File Name>\n");
                }
                break;
            case "enable":
                var file_id = args.splice(0, 1)[0];
                if (file_id) {
                    if (plugin_loader.isPluginLoaded(file_id) && !plugin_loader.isPluginRunning(file_id)) {
                        if (plugin_loader.startPlugin(file_id, true)) {
                            console.log("[PluginLoader]Successfully started Plugin " + file_id);
                        } else {
                            console.log("[PluginLoader]Failed to start Plugin " + file_id + ". Please try 'plugins start " + file_id + "'.");
                        }
                    } else if (!plugin_loader.isPluginLoaded(file_id)) {
                        if (
                            plugin_loader.loadPlugin(file_id, true) &&
                            plugin_loader.startPlugin(file_id, true)
                        ) {
                            console.log("[PluginLoader]Successfully loaded and started Plugin " + file_id);
                        } else {
                            console.log("[PluginLoader]Failed to load or start Plugin " + file_id + ". Please try 'plugins load " + file_id + "' and then 'plugins start " + file_id + "'.");
                        }
                    } else {
                        console.log("[PluginLoader]Plugin " + file_id + " is already running.");
                    }
                } else {
                    console.log("No Plugin File specified!\n\n\tUsage: plugins enable <File Name>\n");
                }
                break;
            case "disable":
                var file_id = args.splice(0, 1)[0];
                if (file_id) {
                    if (plugin_loader.isPluginLoaded(file_id) && !plugin_loader.isPluginRunning(file_id)) {
                        if (plugin_loader.unloadPlugin(file_id, true)) {
                            console.log("[PluginLoader]Successfully unloaded Plugin " + file_id);
                        } else {
                            console.log("[PluginLoader]Failed to unload Plugin " + file_id + ". Please try 'plugins unload " + file_id + "'.");
                        }
                    } else if (plugin_loader.isPluginRunning(file_id)) {
                        if (
                            plugin_loader.stopPlugin(file_id, true) &&
                            plugin_loader.unloadPlugin(file_id, true)
                        ) {
                            console.log("[PluginLoader]Successfully stopped and unloaded Plugin " + file_id);
                        } else {
                            console.log("[PluginLoader]Failed to load or start Plugin " + file_id + ". Please try 'plugins stop " + file_id + "' and then 'plugins unload " + file_id + "'.");
                        }
                    } else {
                        console.log("[PluginLoader]Plugin " + file_id + " is already disabled.");
                    }
                } else {
                    console.log("No Plugin File specified!\n\n\tUsage: plugins enable <File Name>\n");
                }
                break;
            case "reload":
                var file_id = args.splice(0, 1)[0];
                if (file_id) {
                    var isRunning = plugin_loader.isPluginRunning(file_id);
                    if (
                        (!isRunning || plugin_loader.stopPlugin(file_id, true)) &&
                        (!plugin_loader.isPluginLoaded(file_id) || plugin_loader.unloadPlugin(file_id, true)) &&
                        plugin_loader.loadPlugin(file_id, true) &&
                        isRunning ? plugin_loader.startPlugin(file_id, true) : true
                    ) {
                        console.log("[PluginLoader]Plugin " + file_id + " reloaded successfully");
                    } else {
                        console.log("[PluginLoader]Plugin " + file_id + " reload failed! Please reload manually (Stop -> Unload -> Load -> Start).");
                    }
                } else {
                    console.log("No Plugin File specified!\n\n\tUsage: plugins reload <File Name>");
                }
                break;
            case "clearstorage":
                var file_id = args.splice(0, 1)[0];
                if (file_id) {
                    plugin_loader.deleteStorage(file_id);
                } else {
                    console.log("No Plugin File specified!\n\n\tUsage: plugins clearstorage <File Name>");
                }
                break;
            case "list":
                var column_divider = {
                    plugin_name: "------",
                    plugin_version: "-------",
                    plugin_author: "------",
                    plugin_description: "-----------",
                    plugin_state: "-----",
                    plugin_file: "----"
                }
                var data = [
                    {
                        plugin_name: "Plugin",
                        plugin_version: "Version",
                        plugin_author: "Author",
                        plugin_description: "Description",
                        plugin_state: "State",
                        plugin_file: "File"
                    },
                    column_divider
                ]
                var plugin_info; var plugin_state; var plugin;
                var list = plugin_loader.listPlugins();
                for (var plugin_index in list) {
                    try {
                        plugin = list[plugin_index];
                        plugin_info = plugin_loader.getPluginInfo(plugin);
                        if (plugin_loader.isPluginRunning(plugin)) {
                            plugin_state = "Running";
                        } else if (plugin_loader.isPluginLoaded(plugin)) {
                            plugin_state = "Stopped";
                        } else {
                            plugin_state = "Unloaded"
                        }
                        data.push({
                            plugin_name: plugin_info.Name,
                            plugin_version: plugin_info.Version,
                            plugin_author: plugin_info.Author,
                            plugin_description: plugin_info.Description,
                            plugin_state: plugin_state,
                            plugin_file: plugin.replace(/\.dbot\.js/, ""),
                        });
                    } catch (ex) {
                        data.push({
                            plugin_name: "ERROR",
                            plugin_version: "ERROR",
                            plugin_author: "ERROR",
                            plugin_description: ex,
                            plugin_state: "errored",
                            plugin_file: plugin.replace(/\.dbot\.js/, ""),
                        });
                    }
                    data.push(column_divider);
                }
                console.log(
                    "\n" +
                    columnify(data, {
                        columnSplitter: " | ",
                        showHeaders: false,
                        maxLineWidth: "auto",
                        config: {
                            plugin_description: { maxWidth: 20, align: "center" },
                            plugin_name: { maxWidth: 10 }
                        }
                    })
                );
                break;
            default:
                console.log("Unknown subcommand. Type 'plugins help' for a full list of commands");
                break;
        }
    } else {
        printHelp();
    }
}

function bot_cmd(args) {
    var columnify = require("columnify");
    function printHelp() {
        var commands = {
            "disconnect": "Disconnect from Discord",
            "connect": "Connect to Discord",
            "reconnect": "Close and re-establish connection to Discord",
            "join <Invitation Code>": "Join a Server with an invite code",
            "exit": "Shuts the bot down"
        }
        console.log(
            "\n" +
            "Bot Commands\n\n" +
            "\tUsage: bot <subcommand> [arguments]\n\nSubcommands:\n" +
            columnify(commands, {
                columnSplitter: " - ",
                showHeaders: false
            })
        );
    }
    var subcmd = args.splice(0, 1)[0];
    if (subcmd) {
        switch (subcmd.toLowerCase()) {
            case "help":
                printHelp();
                break;
            case "disconnect":
                if (api.connected) {
                    api.connection.disconnect();
                    api.connected = discord.connected;
                } else {
                    console.log("Not connected to Discord!");
                }
                break;
            case "connect":
                if (!api.connected) {
                    api.connection.connect();
                    api.connected = discord.connected;
                } else {
                    console.log("Already connected to Discord as '" + api.client.username + "'!");
                }
                break;
            case "reconnect":
                if (api.connected) api.connection.disconnect();
                api.connection.connect();
                break;
            case "exit":
            case "quit":
                process.exit();
                break;
            case "join":
                var inviteCode = args.splice(0, 1)[0];
                if (!inviteCode) {
                    console.log("No Invitation Code specified!\n\n\tUsage: bot join <Invitation Code>\n");
                    break;
                }
                api.management.acceptInvite(inviteCode, function (error, resp) {
                    if (!error) {
                        console.log("Successfully joined Server! " + resp);
                    } else {
                        console.log("Error occured while joining Server: " + error);
                    }
                });
                break;
            case "say":
                var channelID = args.splice(0, 1)[0];
                if (isNaN(parseInt(channelID))) {
                    console.log("No Channel ID specified!\n\n\tUsage: bot say <Invitation Code> <message>\n");
                    break;
                }
                api.Messages.send(channelID, args.join(" "));
                break;
            case "list":
                for (var server in api.client.servers) {
                    console.log(api.client.servers[server].name + " (" + api.client.servers[server].id + "):");
                    for (var channel in api.client.servers[server].channels) {
                        console.log("\t" + api.client.servers[server].channels[channel].name + " (" + api.client.servers[server].channels[channel].id + "): " + api.client.servers[server].channels[channel].type)
                    }
                }
                break;
            default:
                if (api.Events.listenerCount("botCommand") || api.Events.listenerCount("botCommand#" + subcmd.toLowerCase())) {
                    api.Events.emit("botCommand", subcmd.toLowerCase(), args);
                    api.Events.emit("botCommand#" + subcmd.toLowerCase(), args);
                } else {
                    console.log("Unknown subcommand. Type 'bot help' for a full list of commands");
                }
                break;
        }
    } else {
        printHelp();
    }
}

process.stdin.on('readable', function () {
    function printHelp() {
        var columnify = require("columnify");
        var commands = {
            "plugins|pl <subcommand>": "Everything related with plugins can be done here",
            "bot|discord <subcommand>": "All discord backend related functions",
            "clear|cls": "Clears the screen",
            "exit|quit": "Shuts the bot down",
            "help": "Show this help"
        }
        console.log(
            "\n" +
            "Bot Commands\n\n" +
            "\tUsage: <command> <subcommand> [arguments]\n\n" +
            columnify(commands, {
                columnSplitter: " - ",
                showHeaders: false
            }) + "\n\n" +
            "All Commands that accept subcommands come with a help subcommand\n\n"
        );
    }
    var chunk = process.stdin.read();
    if (chunk !== null) {
        var input = chunk.toString().trim();
        var args = input.split(" ");
        var cmd = args.splice(0, 1)[0];
        switch (cmd.toLowerCase()) {
            case "plugins":
            case "pl":
            case "plugin":
                plugin_cmd(args);
                break;
            case "bot":
            case "discord":
                bot_cmd(args);
                break;
            case "clear":
            case "cls":
                require("cli-clear")();
                break;
            case "exit":
            case "quit":
                process.exit();
                break;
            case "help":
                printHelp();
                break;
            default:
                if (api.Events.listenerCount("command") || api.Events.listenerCount("command#" + cmd.toLowerCase())) {
                    api.Events.emit("command", cmd.toLowerCase(), args);
                    api.Events.emit("command#" + cmd.toLowerCase(), args);
                } else {
                    console.log("\n\nInvalid Command. Use 'help' to get a list of commands.");
                }
                break;
        }
    }
});

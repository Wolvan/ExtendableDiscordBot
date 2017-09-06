#!/usr/bin/env node

'use strict';

// TODO: COMMENTS. COMMENTS MUTHERFRICKN EVERYWHERE FAMALAMS

process.chdir(require("path").dirname(require.main.filename));

const BOT_ONLY_WARN = "This is a bot-only endpoint. Success to using this call not guaranteed.";
const USER_ONLY_WARN = "This is a user-only endpoint. Success to using this call not guaranteed.";
const MSG_MAX_LENGTH = 2000;

const STORAGE_BASE_PATH = process.cwd() + "/storage/";
const PKGJSON = require("./package.json");

const fs = require("fs");
const commander = require("commander");
const columnify = require("columnify");
const eventEmitter2 = require("eventemitter2").EventEmitter2;
const nodePersist = require("node-persist");
const discordIO = require("discord.io");
const read = require("read");
const deepAssign = require("assign-deep");
const Promise = require("bluebird");
const cliClear = require("cli-clear");
const requireReload = require("require-reload");
const pluginLoader2 = require("./modules/pluginloader2.js");
const discordAuth = require("./modules/discordAuth.js");
const stdinh = require("./modules/stdin.js");
const commandContainer = require("./modules/commands.js").CommandContainer;
const updateChecker = require("./modules/updater.js");
const argsplitter = require("./modules/argsplitter.js");

const api = {};
const storage = nodePersist.create({ dir: STORAGE_BASE_PATH + "mainApp" });

const config = {
    login: {
        email: "",
        password: "",
        token: "",
        disableTokenCaching: false
    },
    logging: {
        plugins: {
            load: true,
            unload: true,
            start: true,
            stop: true,
            onlyLastInChange: true
        },
        debugMode: false
    },
    updates: {
        checkOnStartup: true,
        checkRegularly: true,
        checkInterval: 24 * 60 * 60 * 1000
    },
    commandPrefix: "!",
    pluginFileExt: ".dbot2.js"
};

var pluginLoader;
var discord;
var shellCommander;
var updater;
var updaterTimeout;

var manualDisconnect = false;

function loadConfig() {
    var loadedConfig;
    try {
        loadedConfig = requireReload("./config.js");
    } catch (err) {
        try {
            loadedConfig = requireReload("./config.json");
        } catch (error) {
            if (!fs.existsSync("./config.json")) fs.writeFileSync("./config.json", JSON.stringify(config, null, "\t"));
        }
    }
    if (loadedConfig) deepAssign(config, loadedConfig);
}

function checkUpdate() {
    updater.checkUpdate().then(function(data) {
        if (data.newerVersion) {
            console.log([
                " ",
                " ",
                "+-------------------------------+",
                "|     New Version available     |",
                "|                               |",
                "|    Current Version: " + PKGJSON.version + "     |",
                "|     Latest Version: " + updater.getLatestVersion() + "     |",
                "+-------------------------------+",
                " ",
                " "
            ].join("\n"));
            api.events.emit("updateAvailable", data);
        }
    });
}

function initUpdater() {

    updater = new updateChecker("https://api.github.com/repos/Wolvan/ExtendableDiscordBot/releases/latest");

    if (config.updates.checkOnStartup) {
        checkUpdate();
    }
    if (config.updates.checkRegularly) {
        updaterTimeout = setInterval(checkUpdate, config.updates.checkInterval);
    }
}

function initCommander() {
    commander.version(PKGJSON.version).usage("[options]")
        .option("-e, --email <Bot Email>", "Set the bots Login Email.")
        .option("-p, --password <Bot Password>", "Set the bot's Login Password.")
        .option("-t, --token <Token>", "Use an already existing token to login.")
        .option("-f, --file-ext <File Extension>", "Change file extension of plugins to load")
        .option("-c, --command-prefix <Prefix>", "Set the bot's command prefix")
        .option("-d, --debug", "Activate debug mode with full logging")
        .parse(process.argv);

    if (commander.email) config.login.email = commander.email;
    if (commander.password) config.login.password = commander.password;
    if (commander.token) config.login.token = commander.token;
    if (commander.fileExt) config.pluginFileExt = commander.fileExt;
    if (commander.commandPrefix) config.commandPrefix = commander.commandPrefix;
    if (commander.debug) config.logging.debugMode = true;
}

function initPluginLoader() {
    pluginLoader = new pluginLoader2({
        api: api,
        storage: nodePersist.create({ dir: STORAGE_BASE_PATH + "pluginLoader" }),
        apiVersion: PKGJSON.version,
        fileExt: config.pluginFileExt,
    });

    pluginLoader.listPlugins().forEach(function(item) {
        try {
            let pluginState = pluginLoader.getInitialPluginState(item);
            let dependenciesSatisfied;
            if (pluginState === "started" || pluginState === "loaded") {
                dependenciesSatisfied = pluginLoader.loadPlugin(item);
                if (config.logging.plugins.load || config.logging.debugMode)
                    if ((config.logging.plugins.onlyLastInChange && pluginState === "loaded") || !config.logging.plugins.onlyLastInChange || config.logging.debugMode)
                        if (dependenciesSatisfied)
                            console.log(`[PLUGINLOADER]Plugin "${item}" loaded`);
                        else
                            console.log(`[PLUGINLOADER]Plugin "${item}" waiting on dependency`);
            }
            if (pluginState === "started" && dependenciesSatisfied) {
                pluginLoader.startPlugin(item);
                if (config.logging.plugins.start || config.logging.debugMode)
                    if ((config.logging.plugins.onlyLastInChange && pluginState === "started") || !config.logging.plugins.onlyLastInChange || config.logging.debugMode)
                        console.log(`[PLUGINLOADER]Plugin "${item}" started`);
            }
        } catch (ex) {
            console.error(`[PLUGINLOADER]Init for "${item}" errored: ${ex}\n${ex.stack}`);
        }
    });
}

function loadEnvVars() {
    if (process.env.DISCORD_TOKEN) config.login.token = process.env.DISCORD_TOKEN;
    if (process.env.DISCORD_EMAIL) config.login.email = process.env.DISCORD_EMAIL;
    if (process.env.DISCORD_PASSWORD) config.login.password = process.env.DISCORD_PASSWORD;
    if (process.env.DISCORD_FILEEXT) config.pluginFileExt = process.env.DISCORD_FILEEXT;
    if (process.env.DISCORD_PREFIX) config.commandPrefix = process.env.DISCORD_PREFIX;
    if (process.env.DISCORD_DEBUG) config.logging.debugMode = true;
}

function initAPI1() {
    api.events = new eventEmitter2({
        wildcard: true,
        newListener: false,
        maxListeners: 0,
        delimiter: '#',
    });

    api.commands = new commandContainer();
    api.commands.setCommandPrefix(config.commandPrefix);

    api.sharedStorage = nodePersist.create({ dir: STORAGE_BASE_PATH + "shared_storage" });
    api.sharedStorage.initSync();

    let configCopy = deepAssign({}, config);
    delete configCopy.login;
    api.config = configCopy;

    api.permission = {
        FLAGS: {
            GENERAL_CREATE_INSTANT_INVITE: 0x00000001,
            GENERAL_KICK_MEMBERS: 0x00000002,
            GENERAL_BAN_MEMBERS: 0x00000004,
            GENERAL_MANAGE_CHANNELS: 0x00000010,
            GENERAL_MANAGE_GUILD: 0x00000020,
            GENERAL_MANAGE_ROLES: 0x10000000,
            GENERAL_MANAGE_NICKNAMES: 0x08000000,
            GENERAL_CHANGE_NICKNAME: 0x04000000,
            GENERAL_MANAGE_WEBHOOKS: 0x20000000,
            GENERAL_MANAGE_EMOJIS: 0x40000000,

            TEXT_ADD_REACTIONS: 0x00000040,
            TEXT_READ_MESSAGES: 0x00000400,
            TEXT_SEND_MESSAGES: 0x00000800,
            TEXT_SEND_TTS_MESSAGE: 0x00001000,
            TEXT_MANAGE_MESSAGES: 0x00002000,
            TEXT_EMBED_LINKS: 0x00004000,
            TEXT_ATTACH_FILES: 0x00008000,
            TEXT_READ_MESSAGE_HISTORY: 0x00010000,
            TEXT_MENTION_EVERYONE: 0x00020000,
            TEXT_EXTERNAL_EMOJIS: 0x00040000,

            VOICE_CONNECT: 0x00100000,
            VOICE_SPEAK: 0x00200000,
            VOICE_MUTE_MEMBERS: 0x00400000,
            VOICE_DEAFEN_MEMBERS: 0x00800000,
            VOICE_MOVE_MEMBERS: 0x01000000,
            VOICE_USE_VAD: 0x02000000,

            GENERAL_ADMINISTRATOR: 0x00000008,
            GENERAL_OWNER: 0x8000000000
        },
        LETTERS_TO_FLAGS: {
            "a": "GENERAL_CREATE_INSTANT_INVITE",
            "b": "GENERAL_KICK_MEMBERS",
            "c": "GENERAL_BAN_MEMBERS",
            "d": "GENERAL_MANAGE_CHANNELS",
            "e": "GENERAL_MANAGE_GUILD",
            "f": "GENERAL_MANAGE_ROLES",
            "g": "GENERAL_MANAGE_NICKNAMES",
            "h": "GENERAL_CHANGE_NICKNAME",
            "i": "GENERAL_MANAGE_WEBHOOKS",
            "j": "GENERAL_MANAGE_EMOJIS",

            "k": "TEXT_ADD_REACTIONS",
            "l": "TEXT_READ_MESSAGES",
            "m": "TEXT_SEND_MESSAGES",
            "n": "TEXT_SEND_TTS_MESSAGE",
            "o": "TEXT_MANAGE_MESSAGES",
            "p": "TEXT_EMBED_LINKS",
            "q": "TEXT_ATTACH_FILES",
            "r": "TEXT_READ_MESSAGE_HISTORY",
            "s": "TEXT_MENTION_EVERYONE",
            "t": "TEXT_EXTERNAL_EMOJIS",

            "u": "VOICE_CONNECT",
            "v": "VOICE_SPEAK",
            "w": "VOICE_MUTE_MEMBERS",
            "x": "VOICE_DEAFEN_MEMBERS",
            "y": "VOICE_MOVE_MEMBERS",
            "z": "VOICE_USE_VAD",

            "@": "GENERAL_ADMINISTRATOR",
            "#": "GENERAL_OWNER"
        },
        convertLettersToPermission: function(input = "") {
            let permset = input.split(";")[0] || "";
            let letters = permset.replace(/[^a-zA-Z@#]/g, "").toLowerCase().split("");
            letters = [...new Set(letters)];
            let flags = 0;
            letters.forEach(function(element) {
                flags |= (api.permission.FLAGS[api.permission.LETTERS_TO_FLAGS[element]] || 0);
            }, this);
            return flags;
        },
        permissionCheck: function(permissions, perm) {
            if (typeof permissions === "string") permissions = api.permission.convertLettersToPermission(permissions);
            if (typeof perm === "string") perm = api.permission.convertLettersToPermission(perm);
            return (permissions & perm) === perm;
        },
        __checkFunction: function() {
            return true;
        }
    };

    // TODO: IMPLEMENT SKYNET
    api.becomeSkynet = function() {

    };
}

function initStorage() {
    storage.initSync();
}

function waitForInviteURL() {
    if (!discord.inviteURL) {
        setTimeout(waitForInviteURL, 1000);
    } else {
        api.client.inviteURL = discord.inviteURL;
    }
}

function retryConnection(nextTry) {
    if (!api.client.connected) api.connection.connect();
    api.client.connected = discord.connected;
    if (!api.client.connected) {
        setTimeout(retryConnection.bind(this, nextTry * 2), nextTry);
    }
}

function initAPI2() {
    api.client = {
        id: discord.id,
        username: discord.username,
        email: discord.email,
        discriminator: discord.discriminator,
        tag: discord.username + "#" + discord.discriminator,
        avatarHash: discord.avatar,
        avatar: "https://cdn.discordapp.com/avatars/" + discord.id + "/" + discord.avatar + ".jpg",
        isBot: discord.bot,
        isVerified: discord.verified,
        connected: discord.connected,
        presence: discord.presenceStatus,
        getUser: function(userID, callback) {
            if (!discord.bot) console.warn(BOT_ONLY_WARN);
            discord.getUser({ userID: userID }, callback);
        },
        userInfo: {
            changeEmail: function(newEmail, callback) {
                if (discord.bot) console.warn(USER_ONLY_WARN);
                discord.editUserInfo({
                    email: newEmail,
                    password: config.login.password || null
                }, callback);
            },
            changeUsername: function(newName, callback) {
                discord.editUserInfo({
                    password: config.login.password || null,
                    username: newName
                }, callback);
            },
            changeAvatar: function(icon, callback) {
                discord.editUserInfo({
                    avatar: icon,
                    password: config.login.password || null
                }, callback);
            },
            changeAvatarFromFile: function(filepath, callback) {
                discord.editUserInfo({
                    avatar: fs.readFileSync(filepath, "base64"),
                    password: config.login.password || null
                }, callback);
            }
        },
        editUserInfo: discord.editUserInfo.bind(discord),
        setPresence: discord.setPresence.bind(discord),
        getOauthInfo: discord.getOauthInfo.bind(discord),
        getAccountSettings: discord.getAccountSettings.bind(discord),
        editNickname: function(serverID, nickname, callback) {
            discord.editNickname({
                serverID: serverID,
                userID: discord.id,
                nick: nickname
            }, callback);
        }
    };
    waitForInviteURL();
    api.serverList = discord.servers;
    api.channelList = discord.channels;
    api.userList = discord.users;
    api.directMessageList = discord.directMessages;
    api.discord = discord;

    api.connection = {
        connect: function() {
            discord.connect();
            api.connected = discord.connected;
        },
        disconnect: function() {
            manualDisconnect = true;
            discord.disconnect();
            api.connected = discord.connected;
        }
    };
    api.webhook = {
        getServer: discord.getServerWebhooks.bind(discord),
        getChannel: discord.getChannelWebhooks.bind(discord),
        create: discord.createWebhook.bind(discord),
        edit: discord.editWebhook.bind(discord)
    };
    api.server = {
        leave: function(serverID, callback) {
            discord.leaveServer(serverID, (error, response) => {
                if (!error) api.events.emit("leftDiscordServer", { response: response, serverID: serverID });
                if (callback) callback(error, response);
            });
        },
        delete: function(serverID, callback) {
            discord.deleteServer(serverID, function(error, response) {
                if (!error) api.Events.emit("deletedDiscordServer", { serverID: serverID, response: response });
                if (callback) callback(error, response);
            });
        },
        transferOwnership: discord.transferOwnership.bind(discord),
        editWidget: discord.editServerWidget.bind(discord),
        edit: discord.editServer.bind(discord),
        create: function(options, callback) {
            if (discord.bot) console.warn(USER_ONLY_WARN);
            discord.createServer(options, (error, response) => {
                if (!error) api.events.emit("createdDiscordServer", { response: response });
                if (callback) callback(error, response);
            });
        },
        getBans: discord.getBans.bind(discord)
    };
    api.voice = {
        joinChannel: discord.joinVoiceChannel.bind(discord),
        leaveChannel: discord.leaveVoiceChannel.bind(discord),
        getAudioContext: discord.getAudioContext.bind(discord)
    };
    api.emoji = {
        addReaction: function(channelID, messageID, reaction, callback) {
            discord.addReaction({
                channelID: channelID,
                messageID: messageID,
                reaction: reaction
            }, callback);
        },
        // TODO: What is this?!
        getReaction: discord.getReaction.bind(discord),
        removeReaction: function(channelID, messageID, reaction, userID, callback) {
            if (typeof userID === "function") callback = userID;
            discord.removeReaction({
                channelID: channelID,
                messageID: messageID,
                reaction: reaction,
                userID: (typeof userID !== "function" ? userID : null)
            }, callback);
        },
        removeAllReactions: function(channelID, messageID, callback) {
            discord.removeAllReactions({
                channelID: channelID,
                messageID: messageID
            }, callback);
        },
        addServer: function(serverID, name, base64Image, callback) {
            if (discord.bot) console.warn(USER_ONLY_WARN);
            discord.addServerEmoji({
                serverID: serverID,
                name: name,
                image: base64Image
            }, callback);
        },
        deleteServer: function(serverID, emojiID, callback) {
            if (discord.bot) console.warn(USER_ONLY_WARN);
            discord.deleteServerEmoji({
                serverID: serverID,
                emojiID: emojiID
            }, callback);
        },
        editServer: function() {
            if (discord.bot) console.warn(USER_ONLY_WARN);
            discord.editServerEmoji.apply(discord, arguments);
        }
    };
    api.role = {
        create: discord.createRole.bind(discord),
        edit: discord.editRole.bind(discord),
        delete: function(serverID, roleID, callback) {
            discord.deleteRole({
                serverID: serverID,
                roleID: roleID
            }, callback);
        },
        addMember: function(serverID, roleID, userID, callback) {
            discord.addToRole({
                serverID: serverID,
                userID: userID,
                roleID: roleID
            }, callback);
        },
        removeMember: function(serverID, roleID, userID, callback) {
            discord.removeFromRole({
                serverID: serverID,
                userID: userID,
                roleID: roleID
            }, callback);
        }
    };
    api.invite = {
        /*
        TODO: Find a way to re-implement these?
        accept: function(inviteCode, callback) {
            if (inviteCode.indexOf("/") !== -1) {
                inviteCode = inviteCode.substring(inviteCode.lastIndexOf("/") + 1);
            }
            discord.acceptInvite(inviteCode, function(error, response) {
                if (!error) api.Events.emit("joinedServer", response);
                if (callback) callback(error, response);
            });
        },
        create: discord.createInvite.bind(discord),
        */
        delete: function(inviteCode, callback) {
            if (inviteCode.indexOf("/") !== -1) {
                inviteCode = inviteCode.substring(inviteCode.lastIndexOf("/") + 1);
            }
            discord.deleteInvite(inviteCode, callback);
        },
        query: function(inviteCode, callback) {
            if (inviteCode.indexOf("/") !== -1) {
                inviteCode = inviteCode.substring(inviteCode.lastIndexOf("/") + 1);
            }
            discord.queryInvite(inviteCode, callback);
        },
        getServer: discord.getServerInvites.bind(discord),
        getChannel: discord.getChannelInvites.bind(discord)
    };
    api.channel = {
        create: function(serverID, name, type, callback) {
            if (typeof type === "function") callback = type;
            discord.createChannel({
                serverID: serverID,
                name: name,
                type: (typeof type !== "function" ? type : null)
            }, function(error, response) {
                if (!error) api.Events.emit("createdDiscordChannel", response);
                if (callback) callback(error, response);
            });
        },
        createDM: discord.createDMChannel.bind(discord),
        delete: discord.deleteChannel.bind(discord),
        editInfo: discord.editChannelInfo.bind(discord),
        editPermission: discord.editChannelPermissions.bind(discord),
        deletePermission: function(channelID, input, callback) {
            discord.deleteChannelPermission(Object.assign({
                channelID: channelID
            }, input), callback);
        },
        getServer: function(channelID) {
            return (discord.channels && discord.channels[channelID] && discord.channels[channelID].guild_id ? discord.channels[channelID].guild_id : null);
        }
    };
    api.member = {
        kick: function(serverID, userID, callback) {
            discord.kick({
                serverID: serverID,
                userID: userID
            }, callback);
        },
        ban: function(serverID, userID, lastDays, callback) {
            if (typeof lastDays === "function") callback = lastDays;
            discord.ban({
                serverID: serverID,
                userID: userID,
                lastDays: (typeof lastDays !== "function" ? lastDays : null)
            }, callback);
        },
        unban: function(serverID, userID, callback) {
            discord.unban({
                serverID: serverID,
                userID: userID
            }, callback);
        },
        moveTo: function(serverID, userID, channelID, callback) {
            discord.moveUserTo({
                serverID: serverID,
                userID: userID,
                channelID: channelID
            }, callback);
        },
        mute: function(serverID, userID, callback) {
            discord.mute({
                serverID: serverID,
                userID: userID
            }, callback);
        },
        unmute: function(serverID, userID, callback) {
            discord.unmute({
                serverID: serverID,
                userID: userID
            }, callback);
        },
        deafen: function(serverID, userID, callback) {
            discord.deafen({
                serverID: serverID,
                userID: userID
            }, callback);
        },
        undeafen: function(serverID, userID, callback) {
            discord.undeafen({
                serverID: serverID,
                userID: userID
            }, callback);
        },
        get: function(serverID, userID, callback) {
            if (typeof serverID === 'number') {
                discord.getMembers({
                    limit: serverID,
                    after: userID
                }, callback);
            } else {
                discord.getMember({
                    serverID: serverID,
                    userID: userID
                }, callback);
            }
        },
        /*
        DEPRECATED
        getMulti: discord.getMembers.bind(discord),
        */
        getAll: discord.getAllUsers.bind(discord),
        editNickname: function(serverID, userID, nickname, callback) {
            discord.editNickname({
                serverID: serverID,
                userID: userID,
                nick: nickname
            }, callback);
        },
        editNote: function(userID, note, callback) {
            discord.editNote({
                userID: userID,
                note: note
            }, callback);
        }
    };
    Object.assign(api.permission, {
        getEveryoneRole: function(serverID) {
            if (discord && discord.servers && discord.servers[serverID]) {
                for (let roleID in discord.servers[serverID].roles) {
                    if (discord.servers[serverID].roles[roleID].position === 0) return roleID;
                }
            }
            return null;
        },
        //Permission flow: channel user allow/deny > channel role allow > channel role deny > channel @everyone allow/deny > server role allow
        hasPermissionFlag: function(userID, channelID, perm) {
            var permissions = 0;
            var serverID = api.channel.getServer(channelID);
            if (!serverID) return true;

            if (discord && discord.servers && discord.servers[serverID] && discord.servers[serverID].members && discord.servers[serverID].members[userID]) {
                var roles = JSON.parse(JSON.stringify(discord.servers[serverID].members[userID].roles));
                roles.sort(function(a, b) {
                    return discord.servers[serverID].roles[a].position > discord.servers[serverID].roles[b].position;
                });
                var everyoneRole = api.permission.getEveryoneRole(serverID);

                //server roles permissions
                permissions |= discord.servers[serverID].roles[everyoneRole]._permissions;
                roles.forEach(function(element) {
                    permissions |= discord.servers[serverID].roles[element]._permissions;
                });

                //@everyone channel permissions
                if (discord.channels[channelID].permissions.role[everyoneRole]) permissions |= discord.channels[channelID].permissions.role[everyoneRole].allow;
                if (discord.channels[channelID].permissions.role[everyoneRole]) permissions &= ~discord.channels[channelID].permissions.role[everyoneRole].deny;

                //channel role permissions
                roles.forEach(function(element) {
                    if (discord.channels[channelID].permissions.role[element]) {
                        permissions &= ~discord.channels[channelID].permissions.role[element].deny;
                    }
                });

                roles.forEach(function(element) {
                    if (discord.channels[channelID].permissions.role[element]) {
                        permissions |= discord.channels[channelID].permissions.role[element].allow;
                    }
                });

                //user channel permissions
                if (discord.channels[channelID].permissions.user[userID]) {
                    permissions |= discord.channels[channelID].permissions.user[userID].allow;
                    permissions &= ~discord.channels[channelID].permissions.user[userID].deny;
                }

                return api.permission.permissionCheck(permissions, perm);
            }
            return false;
        },
        isOwner: function(serverOrChannelID, userID) {
            if (serverOrChannelID) {
                if (discord.servers[serverOrChannelID]) {
                    return discord.servers[serverOrChannelID].owner_id === userID;
                } else if (discord.channels[serverOrChannelID] && discord.servers[api.channel.getServer(serverOrChannelID)]) {
                    return discord.servers[api.channel.getServer(serverOrChannelID)].owner_id === userID;
                }
            }
            return false;
        },
        hasPermission: function(testID, channelID, perm = 0) {
            return (
                api.permission.isOwner(channelID, testID) ||
                api.permission.hasPermissionFlag(testID, channelID, api.permission.FLAGS.GENERAL_ADMINISTRATOR) ||
                api.permission.hasPermissionFlag(testID, channelID, perm)
            );
        },
        isAdmin: function(testID, channelID) {
            return api.permission.hasPermission(testID, channelID);
        },
        __checkFunction: function(data) {
            if (api.permission.convertLettersToPermission(data.command.getPermission())) {
                if (api.permission.convertLettersToPermission(data.command.getPermission()) & api.permission.FLAGS.GENERAL_OWNER)
                    return api.permission.isOwner(data.channelID, data.userID);
                let result = api.permission.hasPermission(data.userID, data.channelID, api.permission.convertLettersToPermission(data.command.getPermission()));
                if (!result && data.verbose) {
                    let permset = data.command.getPermission().split(";")[0] || "";
                    let letters = permset.replace(/[^a-zA-Z@#]/g, "").toLowerCase().split("");
                    api.message.send(data.channelID, "The following permissions are required to access this command: " + letters.map(letter => {
                        return api.permission.LETTERS_TO_FLAGS[letter];
                    }).join(", "));
                }
                return result;
            }
            return true;
        }
    });
    api.message = {
        getLength: function(message, embed) {
            var length = (message ? message.length : 0);
            if (embed) {
                if (embed && !Array.isArray(embed)) embed = [embed];
                for (let emb of embed) {
                    if (emb.description) length += emb.description.length;
                    if (emb.title) length += emb.title.length;
                    if (emb.footer) length += emb.footer.length;
                    if (emb.fields && Array.isArray(emb.fields)) {
                        for (let field of emb.fields) {
                            length += field.value;
                        }
                    }
                }
            }
            return length;
        },
        checkLength: function(message, embed) {
            return (api.message.getLength(message, embed) <= MSG_MAX_LENGTH);
        },
        simulateTyping: discord.simulateTyping.bind(discord),
        fix: discord.fixMessage.bind(discord),
        deletePinned: function(channelID, messageID, callback) {
            discord.deletePinnedMessage({
                channelID: channelID,
                messageID: messageID
            }, callback);
        },
        getPinned: function(channelID, callback) {
            discord.getPinnedMessages({
                channelID: channelID
            }, callback);
        },
        pin: function(channelID, messageID, callback) {
            discord.pinMessage({
                channelID: channelID,
                messageID: messageID
            }, callback);
        },
        /*
        DEPRECATED
        deleteMulti: function(channelID, messageIDsArray, callback) {
            discord.deleteMessages({
                channelID: channelID,
                messageIDs: messageIDsArray
            }, callback);
        },
        */
        delete: function(channelID, messageID, callback) {
            if (Array.isArray(messageID)) {
                discord.deleteMessages({
                    channelID: channelID,
                    messageIDs: messageID
                }, callback);
            } else {
                discord.deleteMessage({
                    channelID: channelID,
                    messageID: messageID
                }, callback);
            }
        },
        edit: discord.editMessage.bind(discord),
        /*
        DEPRECATED
        getMulti: discord.getMessages.bind(discord),
        */
        get: function(channelID, messageID, before, after, callback) {
            if (typeof messageID === 'number') {
                discord.getMessages({
                    channelID: channelID,
                    limit: messageID,
                    before: before,
                    after: after,
                }, callback);
            } else {
                discord.getMessage({
                    channelID: channelID,
                    messageID: messageID
                }, callback);
            }
        },
        uploadFile: function(channelID, file, filename, message, callback) {
            discord.uploadFile({
                to: channelID,
                file: file,
                filename: filename,
                message: message
            }, callback);
        },
        /*
        DEPRECATED
        send: function(channelID, message, embed, typing = false, tts = false, callback) {
            const MSG_MAX_LENGTH = 2000;

            if (typeof channelID === 'number') {
                channelID = channelID.toString();
            }

            var nonce = "";
            for (let i = 0; i < 25; i++) {
                nonce += Math.floor(Math.random() * 10);
            }

            var msgLength = api.message.getLength(message, embed);
            if (msgLength > MSG_MAX_LENGTH) {
                message = "Message" + (embed ? " and embed" : "") + " length too long: " + msgLength + "/" + MSG_MAX_LENGTH;
                embed = null;
            }

            discord.sendMessage({
                to: channelID,
                message: message,
                tts: tts,
                typing: typing,
                embed: embed,
                nonce: nonce
            }, callback);

            return nonce;
        },
        DEPRECATED
        sendMulti: function(channelID, messages) {
            var nonces = [];
            messages.map(function(item) {
                nonces.push(api.message.send(item.channelID, item.msg, item.embed, item.typing, item.tts));
            });
            return nonces;
        }
        */
        send: function(channelID, message, embed, typing = false, tts = false, delay = 1000, callback, nonce = []) {
            if (Array.isArray(message)) {
                let msgs = message;
                if (embed) {
                    if (embed instanceof Object) {
                        embed.description = msgs.shift();
                    } else {
                        embed = { description: msgs.shift() };
                    }
                    nonce.push(api.message.send(channelID, "", embed, typing, tts));
                } else {
                    nonce.push(api.message.send(channelID, msgs.shift(), null, typing, tts));
                }
                if (msgs.length) {
                    setTimeout(function() {
                        api.message.send(channelID, msgs, embed, typing, tts, delay, null, nonce);
                    }, delay);
                }
                return nonce;
            }

            var msgLength = api.message.getLength(message, embed);
            if (msgLength > MSG_MAX_LENGTH) {
                if (api.message.checkLength(message) && message.length > 0) {
                    nonce.push(api.message.send(channelID, message, null, typing, tts, delay));
                } else {
                    var msgs = api.message.chunkify(message.split("\n"), "\n");
                    if (!api.message.checkLength(msgs[0])) {
                        nonce.concat(api.message.send(channelID, (msgs.shift().match(/[\s\S]{1,2000}/g) || []), null, typing, tts, delay));
                    }
                    nonce.concat(api.message.send(channelID, msgs, null, typing, tts, delay));
                }

                if (embed) {
                    if (api.message.checkLength("", embed) && api.message.getLength("", embed) > 0) {
                        nonce.push(api.message.send(channelID, message, null, typing, tts, delay));
                    } else {
                        let embedCap = MSG_MAX_LENGTH - (api.message.getLength("", embed) - ((embed && embed.description) ? embed.description.length : 0));
                        let embeds = api.message.chunkify(embed.description.split("\n"), "\n", embedCap);

                        if (!api.message.checkLength(embeds[0])) {
                            nonce.concat(api.message.send(channelID, (embeds.shift().match(new RegExp("[\\s\\S]{1," + embedCap + "}", "g")) || []), embed, typing, tts, delay));
                        }
                        nonce.concat(api.message.send(channelID, embeds, embed, typing, tts, delay));
                    }
                }
                return nonce;
            }

            nonce = "";
            for (let i = 0; i < 25; i++) {
                nonce += Math.floor(Math.random() * 10);
            }

            discord.sendMessage({
                to: channelID,
                message: message,
                tts: tts,
                typing: typing,
                embed: embed,
                nonce: nonce
            }, callback);

            return nonce;
        },
        chunkify: function(chunks, separator = "\n", limit = 2000) {
            var msgs = [];
            var msg = [];
            chunks.forEach(function(item) {
                if (msg.join(separator).length + item.length > limit) {
                    msgs.push(msg.join(separator));
                    msg = [];
                }
                msg.push(item);
            });
            msgs.push(msg.join(separator));

            return msgs;
        }
    };
}

function initDiscord() {
    return new Promise((resolve) => {
        discord = new discordIO.Client({
            token: config.login.token,
            autorun: true
        });
        discord
        // Basic Discord Client Events
            .on("ready", (event) => {
                api.events.emit("discord#ready", { rawEvent: event });
                console.log("[CORE]Connected to Discord Network");
                discord.getAllUsers();
                resolve(event);
            })
            .on("disconnect", (errMsg, code) => {
                api.client.connected = discord.connected;
                api.events.emit("discord#disconnected", { errMsg: errMsg, errCode: code });
                console.log("[CORE]Disconnected from Network: Code: " + code + "; Error: " + errMsg);
                if (!manualDisconnect) {
                    retryConnection(5000);
                } else {
                    manualDisconnect = false;
                }
            })
            .on("allUsers", () => {
                api.events.emit("allUsers");
            })
            .on("message", (user, userID, channelID, message, event) => {
                api.events.emit("raw#message", event);
                var nickname = null;
                if (discord.channels[channelID] && discord.channels[channelID].guild_id) {
                    if (discord.servers[discord.channels[channelID].guild_id] && discord.servers[discord.channels[channelID].guild_id].members && discord.servers[discord.channels[channelID].guild_id].members[userID]) {
                        nickname = discord.servers[discord.channels[channelID].guild_id].members[userID].nick;
                    }
                }
                var serverID = "";
                if (discord.channels[channelID] && discord.channels[channelID].guild_id) serverID = discord.channels[channelID].guild_id;
                var msgEventBase = {
                    username: user,
                    nickname: nickname,
                    userID: userID,
                    channelID: channelID,
                    msg: discord.fixMessage(message),
                    msgRaw: message,
                    serverID: serverID,
                    rawEvent: event
                };
                if (api.client && userID === api.client.id) {
                    api.events.emit("selfMessage", msgEventBase);
                } else {
                    api.events.emit("otherMessage", msgEventBase);
                }
                if (api.client && (message.indexOf("<@" + api.client.id + ">") !== -1 || message.indexOf("<@!" + api.client.id + ">") !== -1)) {
                    api.events.emit("botMention", msgEventBase);
                }
                if (channelID === userID) {
                    api.events.emit("directMessage", msgEventBase);
                }
                api.events.emit("message", msgEventBase);
                var cmdPrefix = config.commandPrefix;
                if (message.startsWith(cmdPrefix)) {
                    var cmdArgs = argsplitter(message);
                    var cmd = cmdArgs.splice(0, 1)[0].substring(config.commandPrefix.length).toLowerCase();
                    var resolved = api.commands.resolve(message.substring(config.commandPrefix.length));
                    if (resolved) {
                        let permObject = {
                            command: resolved.command,
                            args: resolved.args,
                            userID: userID,
                            channelID: channelID,
                            serverID: serverID,
                            verbose: true
                        };
                        let runObject = Object.assign({
                            args: resolved.args,
                            simpleArgs: resolved.simpleArgs,
                            rawEvent: event
                        }, msgEventBase);
                        if (resolved.command.getPermission().constructor === Function && resolved.command.getPermission()(permObject))
                            resolved.command.run.call(resolved.command, runObject);
                        else if (resolved.command.getPermission().constructor !== Function && api.permission.__checkFunction(permObject))
                            resolved.command.run.call(resolved.command, runObject);
                    }
                    var chatCmdBase = Object.assign({
                        args: cmdArgs,
                        rawEvent: event
                    }, msgEventBase);
                    api.events.emit("chatCmd", Object.assign({
                        cmd: cmd
                    }, chatCmdBase));
                    api.events.emit("chatCmd#" + cmd, chatCmdBase);
                }
            })
            .on("presence", (username, userID, status, game, event) => {
                api.events.emit("presence", {
                    username: username,
                    userID: userID,
                    status: status,
                    game: game,
                    rawEvent: event
                });
            })
            .on("any", (event) => {
                api.events.emit("webSocket", { rawEvent: event });
            })
            // Websocket cammelCased Events
            .on("messageCreate", (username, userID, channelID, message, event) => {
                api.events.emit("messageCreate", {
                    username: username,
                    userID: userID,
                    channelID: channelID,
                    message: message,
                    rawEvent: event
                });
            })
            .on("messageUpdate", (oldMsg, newMsg, event) => {
                api.events.emit("messageUpdate", {
                    old: oldMsg,
                    new: newMsg,
                    rawEvent: event
                });
            })
            .on("presenceUpdate", (event) => {
                api.events.emit("presenceUpdate", { rawEvent: event });
            })
            .on("userUpdate", (event) => {
                api.events.emit("userUpdate", { rawEvent: event });
            })
            .on("userSettingsUpdate", (event) => {
                api.events.emit("userSettingsUpdate", { rawEvent: event });
            })
            .on("guildCreate", (server, event) => {
                api.events.emit("guildCreate", { server: server, rawEvent: event });
            })
            .on("guildUpdate", (oldServer, newServer, event) => {
                api.events.emit("guildUpdate", {
                    old: oldServer,
                    new: newServer,
                    rawEvent: event
                });
            })
            .on("guildDelete", (server, event) => {
                api.events.emit("guildDelete", { server: server, rawEvent: event });
            })
            .on("guildMemberAdd", (member, event) => {
                let serverID = "";
                if (event && event.d && event.d.guild_id) serverID = event.d.guild_id;
                api.events.emit("guildMemberAdd", {
                    member: member,
                    serverID: serverID,
                    rawEvent: event
                });
            })
            .on("guildMemberUpdate", (oldMember, newMember, event) => {
                let serverID = "";
                if (event && event.d && event.d.guild_id) serverID = event.d.guild_id;
                api.events.emit("guildMemberUpdate", {
                    old: oldMember,
                    new: newMember,
                    serverID: serverID,
                    rawEvent: event
                });
            })
            .on("guildMemberRemove", (member, event) => {
                let serverID = "";
                if (event && event.d && event.d.guild_id) serverID = event.d.guild_id;
                api.events.emit("guildMemberRemove", {
                    member: member,
                    serverID: serverID,
                    rawEvent: event
                });
            })
            .on("guildRoleCreate", (role, event) => {
                let serverID = "";
                if (event && event.d && event.d.guild_id) serverID = event.d.guild_id;
                api.events.emit("guildRoleCreate", {
                    role: role,
                    serverID: serverID,
                    rawEvent: event
                });
            })
            .on("guildRoleUpdate", (oldRole, newRole, event) => {
                let serverID = "";
                if (event && event.d && event.d.guild_id) serverID = event.d.guild_id;
                api.events.emit("guildRoleUpdate", {
                    old: oldRole,
                    new: newRole,
                    serverID: serverID,
                    rawEvent: event
                });
            })
            .on("guildRoleDelete", (role, event) => {
                let serverID = "";
                if (event && event.d && event.d.guild_id) serverID = event.d.guild_id;
                api.events.emit("guildRoleDelete", {
                    role: role,
                    serverID: serverID,
                    rawEvent: event
                });
            })
            .on("channelCreate", (channel, event) => {
                let serverID = "";
                if (event && event.d && event.d.guild_id) serverID = event.d.guild_id;
                api.events.emit("channelCreate", {
                    channel: channel,
                    serverID: serverID,
                    rawEvent: event
                });
            })
            .on("channelUpdate", (oldChannel, newChannel, event) => {
                let serverID = "";
                if (event && event.d && event.d.guild_id) serverID = event.d.guild_id;
                api.events.emit("channelUpdate", {
                    old: oldChannel,
                    new: newChannel,
                    serverID: serverID,
                    rawEvent: event
                });
            })
            .on("channelDelete", (channel, event) => {
                let serverID = "";
                if (event && event.d && event.d.guild_id) serverID = event.d.guild_id;
                api.events.emit("channelDelete", {
                    channel: channel,
                    serverID: serverID,
                    rawEvent: event
                });
            })
            .on("voiceStateUpdate", (event) => {
                let serverID = "";
                if (event && event.d && event.d.guild_id) serverID = event.d.guild_id;
                let channelID = "";
                if (event && event.d && event.d.channel_id) channelID = event.d.channel_id;
                api.events.emit("voiceStateUpdate", {
                    serverID: serverID,
                    channelID: channelID,
                    rawEvent: event
                });
            })
            .on("voiceServerUpdate", (event) => {
                api.events.emit("voiceServerUpdate", { rawEvent: event });
            })
            .on("guildMembersChunk", (event) => {
                api.events.emit("guildMembersChunk", { rawEvent: event });
            });
    });
}

function initShellCommander() {
    shellCommander = new stdinh();
    api.stdin = shellCommander;
    shellCommander.addCommand("credits", "Show credits").setFunction(function() {
        console.log([
            "Extendable Discord Bot 2",
            "The easily hackable Discord Bot with simple plugin system",
            " ",
            "by Wolvan (https://github.com/Wolvan)",
            "With support from Amm and Doxel, thanks guys, you are great.",
            " ",
            "Repository: https://github.com/Wolvan/ExtendableDiscordBot",
            " ",
            " "
        ].join("\n"));
    });

    shellCommander.addCommand("reloadconfig", "Reload the config file and environment variables", ["configreload"]).setFunction(function() {
        loadConfig();
        loadEnvVars();
        delete config.login;
        console.log("Config has been reloaded!");
    });

    let updaterCommands = shellCommander.addCommand("updater", "Manage update notification system");

    shellCommander.addCommand("clear", "Clear the bot's output", ["cls"]).setFunction(function() {
        cliClear();
    });

    updaterCommands.addCommand("help", "Show help for updater commands", ["?"]).setFunction(function() {
        console.log(updaterCommands.getHelp());
    });
    updaterCommands.addCommand("stop", "Disable automatic update checking", ["disable"]).setFunction(function() {
        if (updaterTimeout) {
            clearInterval(updaterTimeout);
            updaterTimeout = null;
        } else {
            console.log("[UPDATER]Updater is already disabled.");
        }
    });
    updaterCommands.addCommand("start", "Enable automatic update checking", ["enable"]).setFunction(function() {
        if (!updaterTimeout) {
            updaterTimeout = setInterval(checkUpdate, config.updates.checkInterval);
        } else {
            console.log("[UPDATER]Updater is already enabled.");
        }
    });
    updaterCommands.addCommand("check", "Manually trigger an update check", ["checknow", "now"]).setFunction(function() {
        checkUpdate();
        console.log("Update check triggered");
    });
}

function initShellCommander2() {
    let pluginCommands = shellCommander.addCommand("plugins", "Manage the bot's plugins", ["pl", "plugin"]);
    let botCommands = shellCommander.addCommand("bot", "Manage the bot's functions", ["discord"]);

    pluginCommands.addCommand("help", "Show help for plugin management", ["?"]).setFunction(function() {
        console.log(pluginCommands.getHelp());
    });
    pluginCommands.addCommand("list", "List all current plugins").setFunction(function(args) {

        var maxPerPage = 10;
        var pluginList = pluginLoader.listPlugins();
        var page = 1;

        if (args[0]) {
            if (args[0].toLowerCase() === "all") {
                maxPerPage = pluginList.length;
            } else {
                if (!isNaN(parseInt(args[0]))) {
                    page = parseInt(args[0]);
                    if (page < 1) page = 1;
                }
            }
        }

        const pages = Math.ceil(pluginList.length / maxPerPage);

        if (page > pages) page = pages;

        var columnDivider = {
            pluginName: "------",
            pluginVersion: "-------",
            pluginAuthor: "------",
            pluginDescription: "-----------",
            pluginState: "-----",
            pluginFile: "----"
        };
        var data = [{
                pluginName: "Plugin",
                pluginVersion: "Version",
                pluginAuthor: "Author",
                pluginDescription: "Description",
                pluginState: "State",
                pluginFile: "File"
            },
            columnDivider
        ];

        let pluginInfo;
        let pluginState;
        let plugin;

        for (let i = 0; i < maxPerPage; i++) {
            try {
                plugin = pluginList[i + ((page - 1) * 10)];
                if (!plugin) continue;
                pluginInfo = pluginLoader.getPluginInfo(plugin);
                if (pluginLoader.isPluginStarted(plugin))
                    pluginState = "Started";
                else if (pluginLoader.isPluginLoaded(plugin))
                    pluginState = "Loaded";
                else
                    pluginState = "Unloaded";
                data.push({
                    pluginName: pluginInfo.Name,
                    pluginVersion: pluginInfo.Version,
                    pluginAuthor: pluginInfo.Author,
                    pluginDescription: pluginInfo.Description,
                    pluginState: pluginState,
                    pluginFile: plugin
                });
            } catch (ex) {
                data.push({
                    pluginName: "Error",
                    pluginVersion: "Error",
                    pluginAuthor: "Error",
                    pluginDescription: ex,
                    pluginState: "Errored",
                    pluginFile: plugin,
                });
            }
            data.push(columnDivider);
        }
        console.log(columnify(data, {
            columnSplitter: " | ",
            showHeaders: false,
            maxLineWidth: "auto",
            config: {
                pluginDescription: { maxWidth: 20, align: "center" },
                pluginName: { maxWidth: 10 }
            }
        }) + "\n\nShowing page " + page + " of " + pages + ". " + pluginList.length + " plugins total.");
    });
    pluginCommands.addCommand("clearstorage", "Delete all saved information of a plugin", ["deletestorage"]).setFunction(function(args) {
        try {
            var fileID = args.splice(0, 1)[0];
            if (fileID) {
                pluginLoader.deleteStorage(fileID);
            } else {
                console.log("No Plugin File specified!\n\n\tUsage: plugins clearstorage <filename>");
            }
        } catch (ex) {
            console.error("[PLUGINLOADER]" + ex + "\n" + ex.stack);
        }
    });
    pluginCommands.addCommand("load", "Load a plugin").setFunction(function(args) {
        try {
            var fileID = args.splice(0, 1)[0];
            if (fileID) {
                let dependenciesSatisfied = pluginLoader.loadPlugin(fileID);
                pluginLoader.setInitialPluginState(fileID, "loaded");
                if (config.logging.plugins.load || config.logging.debugMode)
                    if (dependenciesSatisfied)
                        console.log(`[PLUGINLOADER]Plugin "${fileID}" loaded`);
                    else
                        console.log(`[PLUGINLOADER]Plugin "${fileID}" waiting on dependency`);
            } else {
                console.log("No Plugin File specified!\n\n\tUsage: plugins load <filename>");
            }
        } catch (ex) {
            console.error("[PLUGINLOADER]Failed to load plugin: " + ex + "\n" + ex.stack);
        }
    });
    pluginCommands.addCommand("unload", "Unload a plugin").setFunction(function(args) {
        try {
            var fileID = args.splice(0, 1)[0];
            if (fileID) {
                pluginLoader.unloadPlugin(fileID);
                pluginLoader.setInitialPluginState(fileID, "unloaded");
                if (config.logging.plugins.unload || config.logging.debugMode)
                    console.log(`[PLUGINLOADER]Plugin "${fileID}" unloaded`);
            } else {
                console.log("No Plugin File specified!\n\n\tUsage: plugins unload <filename>");
            }
        } catch (ex) {
            console.error("[PLUGINLOADER]Failed to unload plugin: " + ex + "\n" + ex.stack);
        }
    });
    pluginCommands.addCommand("start", "Start a plugin").setFunction(function(args) {
        try {
            var fileID = args.splice(0, 1)[0];
            if (fileID) {
                pluginLoader.startPlugin(fileID);
                pluginLoader.setInitialPluginState(fileID, "started");
                if (config.logging.plugins.start || config.logging.debugMode)
                    console.log(`[PLUGINLOADER]Plugin "${fileID}" started`);
            } else {
                console.log("No Plugin File specified!\n\n\tUsage: plugins start <filename>");
            }
        } catch (ex) {
            console.error("[PLUGINLOADER]Failed to start plugin: " + ex + "\n" + ex.stack);
        }
    });
    pluginCommands.addCommand("stop", "Stop a plugin").setFunction(function(args) {
        try {
            var fileID = args.splice(0, 1)[0];
            if (fileID) {
                pluginLoader.stopPlugin(fileID);
                pluginLoader.setInitialPluginState(fileID, "loaded");
                if (config.logging.plugins.load || config.logging.debugMode)
                    console.log(`[PLUGINLOADER]Plugin "${fileID}" stopped`);
            } else {
                console.log("No Plugin File specified!\n\n\tUsage: plugins stop <filename>");
            }
        } catch (ex) {
            console.error("[PLUGINLOADER]Failed to stop plugin: " + ex + "\n" + ex.stack);
        }
    });
    pluginCommands.addCommand("enable", "Load and start a plugin").setFunction(function(args) {
        try {
            var fileID = args.splice(0, 1)[0];
            if (fileID) {
                if (!pluginLoader.isPluginLoaded(fileID)) {
                    var dependenciesSatisfied = pluginLoader.loadPlugin(fileID);
                    if (config.logging.plugins.load || config.logging.debugMode)
                        if ((config.logging.plugins.onlyLastInChange && pluginLoader.getInitialPluginState(fileID) === "loaded") || !config.logging.plugins.onlyLastInChange || config.logging.debugMode)
                            if (dependenciesSatisfied) {
                                console.log(`[PLUGINLOADER]Plugin "${fileID}" loaded`);
                            } else {
                                pluginLoader.setInitialPluginState(fileID, "started");
                            }
                }
                if (pluginLoader.isPluginLoaded(fileID) && !pluginLoader.isPluginStarted(fileID) && dependenciesSatisfied) {
                    pluginLoader.startPlugin(fileID);
                    if (config.logging.plugins.start || config.logging.debugMode)
                        console.log(`[PLUGINLOADER]Plugin "${fileID}" started`);
                    pluginLoader.setInitialPluginState(fileID, "started");
                }
                if (!dependenciesSatisfied) console.log(`[PLUGINLOADER]Plugin "${fileID}" waiting for dependencies...`);
            } else {
                console.log("No Plugin File specified!\n\n\tUsage: plugins enable <filename>");
            }
        } catch (ex) {
            console.error("[PLUGINLOADER]Error while enabling \"" + fileID + "\": " + ex + "\n" + ex.stack);
        }
    });
    pluginCommands.addCommand("disable", "Stop and unload a plugin").setFunction(function(args) {
        try {
            var fileID = args.splice(0, 1)[0];
            if (fileID) {
                if (pluginLoader.isPluginStarted(fileID)) {
                    pluginLoader.stopPlugin(fileID);
                    if (config.logging.plugins.stop || config.logging.debugMode)
                        if (!config.logging.plugins.onlyLastInChange || config.logging.debugMode)
                            console.log(`[PLUGINLOADER]Plugin "${fileID}" stopped`);
                }
                if (pluginLoader.isPluginLoaded(fileID)) {
                    pluginLoader.unloadPlugin(fileID);
                    pluginLoader.setInitialPluginState(fileID, "unloaded");
                    if (config.logging.plugins.unload || config.logging.debugMode)
                        console.log(`[PLUGINLOADER]Plugin "${fileID}" unloaded`);
                }
            } else {
                console.log("No Plugin File specified!\n\n\tUsage: plugins disable <filename>");
            }
        } catch (ex) {
            console.error("[PLUGINLOADER]Error while disabling \"" + fileID + "\": " + ex + "\n" + ex.stack);
        }
    });
    pluginCommands.addCommand("reload", "Reload a plugin").setFunction(function(args) {
        try {
            var fileID = args.splice(0, 1)[0];
            if (fileID) {
                let loaded = pluginLoader.isPluginLoaded(fileID);
                let started = pluginLoader.isPluginStarted(fileID);

                if (started) {
                    pluginLoader.stopPlugin(fileID);
                    if (config.logging.plugins.stop || config.logging.debugMode)
                        if (!config.logging.plugins.onlyLastInChange || config.logging.debugMode)
                            console.log(`[PLUGINLOADER]Plugin "${fileID}" stopped`);
                }
                if (loaded) {
                    pluginLoader.unloadPlugin(fileID);
                    if (config.logging.plugins.stop || config.logging.debugMode)
                        if (!config.logging.plugins.onlyLastInChange || config.logging.debugMode)
                            console.log(`[PLUGINLOADER]Plugin "${fileID}" stopped`);
                    let dependenciesSatisfied = pluginLoader.loadPlugin(fileID);
                    if (config.logging.plugins.load || config.logging.debugMode)
                        if ((config.logging.plugins.onlyLastInChange && pluginLoader.getInitialPluginState(fileID) === "loaded") || !config.logging.plugins.onlyLastInChange || config.logging.debugMode)
                            if (dependenciesSatisfied) {
                                console.log(`[PLUGINLOADER]Plugin "${fileID}" loaded`);
                            } else {
                                if (started) pluginLoader.setInitialPluginState(fileID, "started");
                                console.log(`[PLUGINLOADER]Plugin "${fileID}" waiting for dependencies...`);
                            }
                }
                if (started && pluginLoader.isPluginLoaded(fileID)) {
                    pluginLoader.startPlugin(fileID);
                    if (config.logging.plugins.start || config.logging.debugMode)
                        console.log(`[PLUGINLOADER]Plugin "${fileID}" started`);
                }
            } else {
                console.log("No Plugin File specified!\n\n\tUsage: plugins reload <filename>");
            }
        } catch (ex) {
            console.error("[PLUGINLOADER]Error while reloading \"" + fileID + "\": " + ex + "\n" + ex.stack);
        }
    });


    botCommands.addCommand("help", "Show help for plugin management", ["?"]).setFunction(function() {
        console.log(botCommands.getHelp());
    });
    botCommands.addCommand("disconnect", "Disconnect from Discord's network").setFunction(function() {
        if (api.connected) {
            api.connection.disconnect();
            api.connected = discord.connected;
        } else {
            console.log("Not connected to Discord!");
        }
    });
    botCommands.addCommand("connect", "Connect to Discord's network").setFunction(function() {
        if (!api.connected) {
            api.connection.connect();
            api.connected = discord.connected;
        } else {
            console.log("Already connected to Discord as '" + api.client.username + "'!");
        }
    });
    botCommands.addCommand("reconnect", "Dis- and reconnect to Discord's network").setFunction(function() {
        if (api.connected) api.connection.disconnect();
        api.connection.connect();
    });
    botCommands.addCommand("exit", "Quit the bot", ["quit"]).setFunction(function() {
        shellCommander.getCommand("exit").run();
    });
    botCommands.addCommand("say", "Send a message as the bot").setFunction(function(args, simpleArgs) {
        const USAGE = "Usage: bot say <channel ID> <message>";

        let channelID = args.splice(0, 1)[0];
        let message = simpleArgs.slice(1).join(" ");

        if (isNaN(parseInt(channelID))) {
            console.log("No Channel ID specified!\n\n\t" + USAGE + "\n");
            return;
        }
        if (!message) {
            console.log("No message specified!\n\n\t" + USAGE + "\n");
        }

        api.message.send(channelID, message);
    });
    botCommands.addCommand("list", "Show servers and channels the bot is on").setFunction(function() {
        let server;
        let channel;
        for (let serverIndex in api.serverList) {
            server = discord.servers[serverIndex];
            console.log(server.name + " (" + server.id + "):");
            for (let channelIndex in server.channels) {
                channel = server.channels[channelIndex];
                console.log("\t" + channel.name + " (" + channel.id + "): " + channel.type);
            }
        }
    });


    shellCommander.addCommand("debug", "Breakpoint to enter JS context. Requires an attached debugger.", ["break", "breakpoint"]).setFunction(function() {
        /* eslint-disable no-unused-vars */
        let dbgPluginLoader = pluginLoader;
        let dbgShellCommander = shellCommander;
        let dbgApi = api;
        let dbgDiscord = discord;
        /* eslint-enable no-unused-vars */
        console.log([
            "BE CAREFUL! DEBUGGING ALLOWS DEEP LEVEL SYSTEM MODIFICATION",
            "WRONG SETTINGS COULD END UP BLOWING UP YOUR BOT! I DO NOT TAKE",
            "ANY RESPONSIBILITY FOR ANYTHING THAT GOES WRONG FROM THIS POINT ON",
            " ",
            "Available functions and objects:",
            " ",
            "dbgPluginLoader - Main pluginLoader system",
            "dbgShellCommander - Stdin command listener system",
            "dbgApi - Full access to the API that plugins get",
            "dbgDiscord - Access to the raw discord.io client",
            "stdinCommand(commandString) - Send raw commands to stdin",
            " ",
            "Debugging brought to you by Wolvan"
        ].join("\n"));
        debugger;
    });

    shellCommander.addCommand("exit", "Quit the bot", ["quit"]).setFunction(function() {
        api.events.emit("shutdown");
        setTimeout(api.connection.disconnect, 500);
        setTimeout(process.exit.bind(this, 0), 1000);
    });

    shellCommander.getCommand("reloadconfig").setFunction(function() {
        loadConfig();
        loadEnvVars();
        delete config.login;
        api.events.emit("configReloaded");
        console.log("Config has been reloaded!");
    });
}

function init() {
    function connectToDiscord() {
        initDiscord().then(function() {
            initAPI2();
            initPluginLoader();
            initShellCommander2();
        });
    }
    // Load configuration values and get login info
    // Console Arguments > Environment Variables > Config File > Default config
    loadConfig();
    loadEnvVars();
    initCommander();

    initUpdater();

    initStorage();

    initUpdater();

    initAPI1();
    initShellCommander();

    if (!config.login.token) {
        (function() {
            function readEmail(callback) {
                shellCommander.pause();
                read({ prompt: "EMail: " }, function(err, email) {
                    if (!email) {
                        readEmail(callback);
                        return;
                    }
                    shellCommander.start();
                    config.login.email = email.trim();
                    if (callback) callback();
                });
            }

            function readPassword(callback) {
                shellCommander.pause();
                read({ prompt: "Password: ", replace: "*", silent: true }, function(err, password) {
                    if (!password) {
                        readPassword(callback);
                        return;
                    }
                    shellCommander.start();
                    config.login.password = password.trim();
                    if (callback) callback();
                });
            }

            function connect() {
                discordAuth(config.login.email, config.login.password, config.login.disableTokenCaching).then(function(token) {
                    config.login.token = token;
                    connectToDiscord();
                }).catch(console.log);
            }

            if (!config.login.email) readEmail(function() {
                if (!config.login.password) readPassword(connect);
                else connect();
            });
            if (config.login.email && !config.login.password) readPassword(connect);
            if (config.login.email && config.login.password) connect();
        })();
    } else {
        connectToDiscord();
    }
}

init();

global.stdinCommand = function(commandString) {
    shellCommander.write(commandString);
};

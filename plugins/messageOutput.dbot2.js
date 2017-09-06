"use strict";
var api;

function chatmsg(data) {
    var location = data.channelID;
    if (api.channelList[data.channelID]) {
        var channel = api.channelList[data.channelID];
        location = api.serverList[channel.guild_id].name + "#" + channel.name;
    } else if (api.directMessageList[data.channelID]) {
        location = api.directMessageList[data.channelID].recipient.username + " DM";
    }
    console.log(data.username + "[" + location + "]: " + data.msg);
}

module.exports = {
    metaInf: {
        name: "Message Output",
        version: "1.0.0",
        description: "Read the chat from the bot console.",
        author: "Wolvan"
    },
    load: function(_api) {
        api = _api;
    },
    start: function() {
        api.events.on("message", chatmsg);
    },
    stop: function() {
        api.events.removeListener("message", chatmsg);
    }
};

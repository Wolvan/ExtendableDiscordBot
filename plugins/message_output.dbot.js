var api;

function chatmsg(data) {
    console.log(data.username + " (" + data.userID + ") in [" + data.channelID + "]: " + data.message);
}

module.exports = {
    meta_inf: {
        name: "Message Output",
        version: "1.0.0",
        description: "Read the chat from the bot console.",
        author: "Wolvan"
    },
    load: function (_api) {
        api = _api;
    },
    start: function () {
        api.Events.on("message", chatmsg);
    },
    stop: function () {
        api.Events.removeListener("message", chatmsg);
    }
}

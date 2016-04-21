var api;
var storage;

function addRequestToQEvent(channelID, request) {
    var requests = storage.getItem(channelID + "_requests") || [];
    requests.push(request);
    storage.setItem(channelID + "_requests", requests);
    api.Messages.send(channelID, "Added request '" + request + "'");
}
function handleCmd(data) {
    var args = data.args;
    if (!args[0] || args[0].toLowerCase() === "list") {
        var requests = storage.getItem(data.channelID + "_requests") || [];
        var msg = "There currently " + (requests.length !== 1 ? "are" : "is") + " " + (!requests.length ? "no" : requests.length) + " request" + (requests.length !== 1 ? "s" : "") + " in the queue" + (requests.length ? ":" : ".");
        requests.forEach(function (item, index) {
            msg = msg + "\n" + (index + 1) + " - " + item;
        });
        api.Messages.send(data.channelID, msg);
    } else if (args[0] === "?" || args[0].toLowerCase() === "help") {
        api.Messages.send(data.channelID, "Add, delete or list requests! You can also raffle a random request!");
    } else if (args[0].toLowerCase() === "raffle") {
        var requests = storage.getItem(data.channelID + "_requests") || [];
        if (!requests.length) {
            api.Messages.send(data.channelID, "No requests to raffle");
            return;
        }
        api.Messages.send(data.channelID, "Do this request: " + requests[Math.floor(Math.random() * requests.length)]);
    } else if (args[0].toLowerCase() === "delete" || args[0].toLowerCase() === "del" || args[0].toLowerCase() === "rm") {
        var index = parseInt(args[1]) - 1;
        if (isNaN(index)) {
            api.Messages.send(data.channelID, "No index to remove specified.");
            return;
        }
        var requests = storage.getItem(data.channelID + "_requests") || [];
        var removed = requests.splice(index, 1)[0];
        storage.setItem(data.channelID + "_requests", requests);
        removed ? api.Messages.send(data.channelID, "Removed request '" + removed + "'") : api.Messages.send(data.channelID, "Request with index " + (index + 1) + " not found.");
    } else if (parseInt(args[0])) {
        var index = parseInt(args[0]) - 1;
        var requests = storage.getItem(data.channelID + "_requests") || [];
        requests[index] ? api.Messages.send(data.channelID, (index + 1) + " - " + requests[index]) : api.Messages.send(data.channelID, "Request with index " + (index + 1) + " not found.");
    } else {
        if (args[0].toLowerCase() === "add") args.splice(0, 1);
        var requests = storage.getItem(data.channelID + "_requests") || [];
        requests.push(args.join(" "));
        storage.setItem(data.channelID + "_requests", requests);
        api.Messages.send(data.channelID, "Added request '" + args.join(" ") + "'");
    }
}
module.exports = {
    meta_inf: {
        name: "Request Queue",
        version: "1.0.0",
        description: "Store requests for later.",
        author: "Wolvan"
    },
    load: function (_api, _storage) {
        api = _api;
        storage = _storage;
        api.Events.on("requestq_addRequestToQ", addRequestToQEvent);
    },
    start: function () {
        api.Events.on("chatCmd#request", handleCmd);
        api.Events.on("chatCmd#requests", handleCmd);
    },
    stop: function () {
        api.Events.removeListener("chatCmd#request", handleCmd);
        api.Events.removeListener("chatCmd#requests", handleCmd);
    },
    unload: function () {
        api.Events.removeListener("requestq_addRequestToQ", addRequestToQEvent);
    }
}

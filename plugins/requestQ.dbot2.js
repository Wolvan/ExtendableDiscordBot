"use strict";

const requestQueueKey = "requests_%cID";

var api;
var storage;

var command;

function initCommand() {
    command = api.commands.addCommand("request", "Show and manage the request queue for this channel", ["requests"]).setFunction(function(data) {
        let requestedChannel = data.channelID;
        let msg = "There currently %BE %NO request%PLURALS%SIGN%REQUESTS";

        if (data.args[0]) {
            // TODO: channel name resolution, I hand that over to Amm
            // Just set requestedChannel to wherever you want the requests to be grabbed from
            // or modify the message if you want a custom error message or something
            // You probably figure it out
        }

        let requests = getRequests(requestedChannel);
        msg = msg
            .replace(/%BE/g, (requests.length !== 1 ? "are" : "is"))
            .replace(/%NO/g, (requests.length ? requests.length : "no"))
            .replace(/%PLURALS/g, (requests.length !== 1 ? "s" : ""))
            .replace(/%SIGN/g, (requests.length ? ":\n" : "."))
            .replace(/%REQUESTS/g, requests.map(function(item, index) {
                return (index + 1) + " - " + item;
            }).join("\n"));

        api.message.send(data.channelID, msg);
    });

    command.addCommand("help", "", ["?"]).setFunction(function(data) {
        api.message.send(data.channelID, command.getHelp());
    });

    command.addCommand("raffle", "Choose a random request from this channel's list", ["random"]).setFunction(function(data) {
        let requestList = getRequests(data.channelID);

        if (!requestList.length) {
            api.message.send(data.channelID, "No requests to raffle!");
            return;
        }

        api.message.send(data.channelID, "Do this request: " + requestList[Math.floor(Math.random * requestList.lengt)]);
    });

    command.addCommand("add", "Add a request to this channel's list").setSyntax("add <request>").setFunction(function(data) {
        let request = data.simpleArgs.join(" ");
        if (!request) {
            api.message.send(data.channelID, "No request text to add specified");
            return;
        }

        let index = addRequest(data.channelID, request);

        api.message.send(data.channelID, "Request '" + request + "' added with ID " + (index + 1));
    });

    command.addCommand("delete", "Delete a request from this channel's list", ["remove", "delet", "rm"]).setSyntax("delete <ID>").setFunction(function(data) {
        let index = parseInt(data.args[0]) - 1;
        if (!data.args[0] || isNaN(index)) {
            api.message.send(data.channelID, "Index " + index + " is not valid. Please specify a numeric index");
            return;
        }

        if (!getRequests(data.channelID)[index]) {
            api.message.send(data.channelID, "Index " + data.args[0] + " not found, please check the ID on the list first");
            return;
        }

        let deletedRequest = deleteRequest(data.channelID, index)
        if (deletedRequest) {
            api.message.send(data.channelID, "Request '" + deletedRequest + "' with index " + data.args[0] + " has been deleted");
        }
    });
}

function addRequest(channelID, request) {
    if (!channelID || !request) return false;
    let requestList = storage.getItemSync(requestQueueKey.replace(/%cID/g, channelID)) || [];
    let index = requestList.push(request) - 1;
    storage.setItem(requestQueueKey.replace(/%cID/g, channelID), requestList);
    return index;
}

function deleteRequest(channelID, requestIndex) {
    if (!channelID) return false;
    let requestList = storage.getItemSync(requestQueueKey.replace(/%cID/g, channelID)) || [];
    if (requestList[requestIndex]) {
        let entry = requestList.splice(requestIndex, 1);
        storage.setItem(requestQueueKey.replace(/%cID/g, channelID), requestList);
        if (entry) return entry[0];
    }
    return false;
}

function getRequests(channelID) {
    if (!channelID) return false;
    return (storage.getItemSync(requestQueueKey.replace(/%cID/g, channelID)) || []);
}

function setRequests(channelID, requestArray) {
    if (!channelID) return false;
    if (!requestArray) return false;
    if (!Array.isArray(requestArray)) requestArray = [requestArray];
    storage.setItemSync(requestQueueKey.replace(/%cID/g, channelID), requestArray);
    return true;
}

module.exports = {
    metaInf: {
        name: "Request Queue",
        version: "2.0.0",
        description: "Store and retrieve requests",
        author: "Wolvan",
        apiVersionRequired: "^2.0.0"
    },
    load: function(_api, _storage) {
        api = _api;
        storage = _storage;
    },
    start: function() {
        initCommand();
    },
    stop: function() {
        if (command) {
            command.delete();
            command = null;
        }
    },
    addRequest: addRequest,
    getRequests: getRequests,
    deleteRequest: deleteRequest,
    setRequests: setRequests
};

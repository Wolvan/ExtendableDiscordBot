'use strict';

const META = {
    author: "Wolvan",
    name: "Stdin Handler",
    description: "Manage commands that can be typed into the stdin.",
    version: "1.0.0"
};

const CommandContainer = require("./commands.js").CommandContainer;

const stdinListeners = new WeakMap();
const paused = new WeakMap();

class StdioHandler extends CommandContainer {
    constructor() {
        super();
        stdinListeners.set(this, (chunk) => {
            if (paused.get(this)) return;
            chunk = chunk || process.stdin.read();
            if (chunk !== null) {
                var input = chunk.toString().trim();
                super.resolveAndRun(input);
            }
        });
        process.stdin.on("readable", stdinListeners.get(this));
        this.addCommand("help", "Show registered commands", ["?"]).setFunction(() => {
            var allCmds = this.getCommands();
            console.log(Object.keys(allCmds).map((item) => {
                return `${item} - ${allCmds[item].description}`;
            }).join("\n"));
        });
    }

    destroy() {
        super.destroy();
        process.stdin.removeListener("readable", stdinListeners.get(this));
        stdinListeners.delete(this);
    }

    pause() {
        paused.set(this, true);
    }

    start() {
        paused.set(this, false);
    }

    write(str) {
        stdinListeners.get(this).call(process.stdin, str);
    }
}

module.exports = StdioHandler;
module.exports.META = META;

'use strict';

(function () {
    const META = {
        author: "Wolvan",
        name: "Commands",
        description: "A module that gives a basic system of registering commands.",
        version: "1.1.0"
    };

    const argsplitter = require("./argsplitter.js");

    const hookedCommands = new WeakMap();
    const commandAlias = new WeakMap();
    const callbacks = new WeakMap();
    const aliasArray = new WeakMap();
    const helps = new WeakMap();
    const selfCommand = new WeakMap();
    const parentContainer = new WeakMap();
    const commandDescription = new WeakMap();
    const permissionString = new WeakMap();
    const usageSyntax = new WeakMap();
    const prefixes = new WeakMap();

    class CommandContainer {
        constructor() {
            hookedCommands.set(this, {});
            commandAlias.set(this, {});
            aliasArray.set(this, {});
        }

        destroy() {
            hookedCommands.delete(this);
            commandAlias.delete(this);
            aliasArray.delete(this);
        }

        addCommand(_cmd = "", _description = "", _aliases = [], _permissionFlag = "") {
            if (!_cmd) return;
            aliasArray.get(this)[_cmd.toLowerCase()] = [];
            if (_aliases && !Array.isArray(_aliases)) _aliases = [_aliases.toString()];
            if (Array.isArray(_aliases)) {
                for (var alias of _aliases) {
                    commandAlias.get(this)[alias.toLowerCase()] = _cmd.toLowerCase();
                    aliasArray.get(this)[_cmd.toLowerCase()].push(alias.toLowerCase());
                }
            }

            var cmd = new Command();

            selfCommand.set(cmd, _cmd.toLowerCase());
            commandDescription.set(cmd, _description);
            parentContainer.set(cmd, this);
            permissionString.set(cmd, _permissionFlag);
            prefixes.set(cmd, prefixes.get(this));

            hookedCommands.get(this)[_cmd.toLowerCase()] = {
                command: cmd,
                description: _description
            };

            return cmd;
        }

        removeCommand(_command = "") {
            if (!_command) return this;
            if (commandAlias.get(this)[_command.toLowerCase()]) _command = commandAlias.get(this)[_command.toLowerCase()];
            if (!hookedCommands.get(this)[_command.toLowerCase()]) return this;
            hookedCommands.get(this)[_command.toLowerCase()].command.destroy();
            delete hookedCommands.get(this)[_command.toLowerCase()];
            var aliases = aliasArray.get(this)[_command.toLowerCase()];
            for (var alias of aliases) {
                delete commandAlias.get(this)[alias.toLowerCase()];
            }
            delete aliasArray.get(this)[_command.toLowerCase()];
            return this;
        }

        getCommands() {
            return hookedCommands.get(this);
        }
        getCommand(_command = "") {
            if (!_command) return;
            if (commandAlias.get(this)[_command.toLowerCase()]) _command = commandAlias.get(this)[_command.toLowerCase()];
            if (!hookedCommands.get(this)[_command.toLowerCase()]) return;
            return hookedCommands.get(this)[_command.toLowerCase()].command;
        }

        setHelp(helpText) {
            if (helpText) {
                helps.set(this, helpText);
            } else {
                helps.delete(this);
            }
            return this;
        }
        getHelp() {
            var helpText = helps.get(this);
            if (!helpText) {
                var allCmds = this.getCommands();
                return (selfCommand.get(this) ? selfCommand.get(this) + " - " + commandDescription.get(this) + "\n\n" : "") + Object.keys(allCmds).reduce((result, item) => {
                    if (allCmds[item].description)
                        result.push((allCmds[item].command.getSyntax() ? allCmds[item].command.getSyntax() : item) + " - " + allCmds[item].description);
                    return result;
                }, []).join("\n");
            }
            return helpText;
        }

        setCommandPrefix(prefix) {
            if (prefix) {
                prefixes.set(this, prefix);
            } else {
                prefixes.delete(this);
            }
            return this;
        }
        getCommandPrefix() {
            return prefixes.get(this) || "";
        }

        addAliasToCommand(_command = "", _alias = "") {
            if (!_command || !_alias) return this;
            if (aliasArray.get(this)[_command.toLowerCase()].indexOf(_alias.toLowerCase()) === -1) {
                aliasArray.get(this)[_command.toLowerCase()].push(_alias.toLowerCase());
                commandAlias.get(this)[_alias.toLowerCase()] = _command.toLowerCase();
            }
            return this;
        }
        removeAliasFromCommand(_command = "", _alias = "") {
            if (!_command || !_alias) return this;
            if (aliasArray.get(this)[_command.toLowerCase()].indexOf(_alias.toLowerCase()) !== -1) {
                aliasArray.get(this)[_command.toLowerCase()].splice(aliasArray.get(this)[_command.toLowerCase()].indexOf(_alias.toLowerCase()), 1);
                delete commandAlias.get(this)[_alias.toLowerCase()];
            }
            return this;
        }

        resolve(rawCommandString) {
            var args = argsplitter(rawCommandString);
            var cmd = args.splice(0, 1)[0];
            var resolvedCommand = this.getCommand(cmd);
            var tmp = resolvedCommand;
            var tmpArg;
            var simpleCommandString = rawCommandString;
            if (tmp) simpleCommandString = simpleCommandString.substr(cmd.length + 1);
            while (tmp) {
                resolvedCommand = tmp;
                tmpArg = args.splice(0, 1)[0];
                tmp = tmp.getCommand(tmpArg);
                if (tmp) simpleCommandString = simpleCommandString.substr(tmpArg.length + 1);
            }
            if (tmpArg) args.unshift(tmpArg);
            if (resolvedCommand) return {
                command: resolvedCommand,
                args: args,
                simpleArgs: simpleCommandString.trim().split(" ")
            };
        }

        resolveAndRun(rawCommandString) {
            var resolved = this.resolve(rawCommandString);
            if (resolved) {
                return resolved.command.run.call(resolved.command, resolved.args, resolved.simpleArgs);
            }
        }
    }

    class Command extends CommandContainer {
        constructor() {
            super();
            callbacks.set(this, function () {
                // A default function that should be changed by calling
                // setFunction(callback) on the command object
                // It prints the attached help by default
                console.log(this.getHelp());
            });
        }
        destroy() {
            super.destroy();
            callbacks.delete(this);
            helps.delete(this);
            selfCommand.delete(this);
            parentContainer.delete(this);
            commandDescription.delete(this);
            usageSyntax.delete(this);
        }

        setFunction(callback) {
            callbacks.set(this, callback);
            return this;
        }

        setSyntax(usageString) {
            if (usageString) {
                usageSyntax.set(this, usageString);
            } else {
                usageSyntax.delete(this);
            }
            return this;
        }
        getSyntax() {
            return usageSyntax.get(this) || "";
        }

        getPermission() {
            return permissionString.get(this);
        }
        setPermission(permString) {
            permissionString.set(this, permString);
            return this;
        }

        getAliases() {
            return aliasArray.get(parentContainer.get(this))[selfCommand.get(this)];
        }
        addAlias(alias) {
            super.addAliasToCommand.call(parentContainer.get(this), selfCommand.get(this), alias);
            return this;
        }
        removeAlias(alias) {
            super.removeAliasFromCommand.call(parentContainer.get(this), selfCommand.get(this), alias);
            return this;
        }

        getSelfCommand() {
            return selfCommand.get(this);
        }

        getParentCommand() {
            return parentContainer.get(this);
        }

        delete() {
            this.getParentCommand().removeCommand(this.getSelfCommand());
            return null;
        }

        run() {
            return callbacks.get(this).apply(this, arguments);
        }
    }

    let exportData = {};
    exportData.Command = Command;
    exportData.CommandContainer = CommandContainer;
    exportData.META = META;
    /* global window, module */
    if (typeof module !== 'undefined' && module.exports) module.exports = exportData;
    if (typeof window !== 'undefined') window.Commands = exportData;
})();

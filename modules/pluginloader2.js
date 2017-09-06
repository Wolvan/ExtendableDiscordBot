'use strict';

(function () {
    const META = {
        author: "Wolvan",
        name: "PluginLoader2",
        description: "A loader module to load and manage states of plugin files.",
        version: "1.0.0"
    };

    const PLUGIN_DIR = "/plugins";
    const FILE_EXTENSION = ".plugin.js";
    const LOGTAG = "PLUGINLOADER";

    const fs = require("fs");
    const reload = require("require-reload");
    const nodePersist = require("node-persist");
    const eventEmitter2 = require("eventemitter2").EventEmitter2;
    const semver = require("semver");
    const pmEmitterDefault = {
        wildcard: true,
        newListener: false,
        maxListeners: 0
    };
    const ExtendableError = require("./extendableError.js");

    const properties = {
        api: new WeakMap(),
        storage: new WeakMap(),
        apiVersion: new WeakMap(),
        fileExt: new WeakMap(),
        parent: new WeakMap(),
        basedir: new WeakMap(),
        pluginsdir: new WeakMap(),
        loadedPlugins: new WeakMap(),
        startedPlugins: new WeakMap(),
        dependencyTree: new WeakMap(),
        delayedPlugins: new WeakMap(),
        loadAttempts: new WeakMap(),
        pmEmitters: new WeakMap()
    };
    const eventListeners = {
        pluginLoad: new WeakMap(),
        parentPluginLoad: new WeakMap(),
        pluginStart: new WeakMap(),
        parentPluginStart: new WeakMap(),
        pluginStop: new WeakMap(),
        parentPluginStop: new WeakMap(),
        pluginUnload: new WeakMap(),
        parentPluginUnload: new WeakMap()
    };

    class InvalidPluginError extends ExtendableError { }
    class PluginSyntaxError extends InvalidPluginError { }
    class PluginAlreadyLoadedError extends ExtendableError { }
    class PluginAlreadyStartedError extends ExtendableError { }
    class PluginStillStartedError extends ExtendableError { }
    class PluginNotLoadedError extends ExtendableError { }
    class PluginNotStartedError extends ExtendableError { }
    class ApiVersionMismatch extends ExtendableError {
        constructor(filename, api, required) {
            super(`Plugin "${filename}" requires API "${required}", got v${api}.\nYou may need to update the bot or report this behavior to the plugin author(s).`);
        }
    }
    class MissingDependency extends ExtendableError {
        constructor(filename, dep) {
            super(`${filename} requires Plugin ${dep.name} version "${dep.version}" ${dep.state === "running" ? "started" : "loaded"}. Loading impossible.`);
        }
    }
    class FileNotFoundError extends ExtendableError {
        constructor(filename) {
            super("File '" + filename + "' not found");
        }
    }

    function injectDependencies(deps = {}) {
        var packageJSON = reload("../package.json");
        var injectedEntries = 0;
        for (var dep in deps) {
            if (!packageJSON.dependencies[dep]) {
                packageJSON.dependencies[dep] = deps[dep];
                console.log("Injecting " + dep + " (" + deps[dep] + ")");
                injectedEntries++;
            }
        }
        if (injectedEntries) {
            fs.writeFileSync("./package.json", JSON.stringify(packageJSON, null, 2));
            if (fs.existsSync("./package-lock.json")) fs.unlinkSync("./package-lock.json");
            if (fs.existsSync("../package-lock.json")) fs.unlinkSync("../package-lock.json");
            console.log("Injection successful, running npm");
            require("child_process").execSync("npm i");
        }
    }

    function parentPluginLoaded(fileID, eventData) {
        properties.pmEmitters.get(this).emit("pluginLoaded", fileID, {
            parent: true,
            pluginInfo: eventData.pluginInfo
        });
    }

    function parentPluginStarted(fileID, eventData) {
        properties.pmEmitters.get(this).emit("pluginStarted", fileID, {
            parent: true,
            pluginInfo: eventData.pluginInfo
        });
    }

    function parentPluginStopped(fileID, eventData) {
        properties.pmEmitters.get(this).emit("pluginStopped", fileID, {
            parent: true,
            pluginInfo: eventData.pluginInfo
        });
    }

    function parentPluginUnloaded(fileID, eventData) {
        properties.pmEmitters.get(this).emit("pluginUnloaded", fileID, {
            parent: true,
            pluginInfo: eventData.pluginInfo
        });
    }

    function pluginLoaded() {
        var queue = properties.delayedPlugins.get(this);
        for (let pluginObject of queue) {
            try {
                if (this.allDependenciesSatisfied(pluginObject.plugin)) {
                    let initialState = this.getInitialPluginState(pluginObject.plugin);
                    if (initialState === "loaded" || initialState === "started")
                        if (!this.isPluginLoaded(pluginObject.plugin)) {
                            this.loadPlugin(pluginObject.plugin);
                            if (pluginObject.log && initialState === "loaded") console.log(`[${LOGTAG}]Loaded "${pluginObject.plugin}" after dependencies.`);
                        }
                    if (initialState === "started")
                        if (!this.isPluginStarted(pluginObject.plugin)) {
                            this.startPlugin(pluginObject.plugin);
                            if (pluginObject.log) console.log(`[${LOGTAG}]Started "${pluginObject.plugin}" after dependencies.`);
                        }
                    queue.splice(queue.indexOf(pluginObject), 1);
                }
            } catch (error) {
                if (!pluginObject.alreadyPrintedMissingError) {
                    console.log(error);
                    pluginObject.alreadyPrintedMissingError = true;
                }
            }
        }
    }

    function pluginStarted() {
        pluginLoaded.call(this);
    }

    function pluginUnloaded(fileID) {
        var depTree = properties.dependencyTree.get(this);
        if (depTree[fileID]) {
            for (let dependant of depTree[fileID]) {
                if (!this.getPluginInfo(dependant).StayLoadedOnDepdencyLossyLoaded) {
                    if (this.isPluginStarted(dependant))
                        this.stopPlugin(dependant);
                    if (this.isPluginLoaded(dependant))
                        this.unloadPlugin(dependant);
                    properties.delayedPlugins.get(this).push({
                        plugin: dependant,
                        log: true
                    });
                }
            }
            delete depTree[fileID];
        }
    }

    function pluginStopped(fileID) {
        pluginUnloaded.call(this, fileID);
    }

    class PluginLoader2 {
        constructor(
            _apiOrData = {},
            _storage = nodePersist.create({ dir: process.cwd() + "/storage/pluginLoader2" }),
            _apiVersion = "0.0.0",
            _baseDir = process.cwd(),
            _fileExt = FILE_EXTENSION,
            _definePmApi = true,
            _parentPl = null
        ) {
            var _api;
            if (arguments.length === 1 && _apiOrData === Object(_apiOrData)) {
                _api = _apiOrData.api || _apiOrData;
                _storage = _apiOrData.storage || _storage;
                _apiVersion = _apiOrData.apiVersion || _apiVersion;
                _baseDir = _apiOrData.baseDir || _baseDir;
                _fileExt = _apiOrData.fileExt || _fileExt;
                _definePmApi = _apiOrData.definePmApi || _definePmApi;
                _parentPl = _apiOrData.parentPl || _parentPl;
            } else {
                _api = _apiOrData;
            }

            _storage.initSync();

            const pluginLoader = this;
            const pmEmitter = new eventEmitter2(pmEmitterDefault);
            if (_definePmApi) {
                const PMAPI = {
                    load: function (fileID = "") {
                        console.log("[Plugin]Plugin requests loading of " + fileID);
                        return pluginLoader.loadPlugin(fileID);
                    },
                    unload: function (fileID = "") {
                        console.log("[Plugin]Plugin requests unloading of " + fileID);
                        return pluginLoader.unloadPlugin(fileID);
                    },
                    start: function (fileID = "") {
                        console.log("[Plugin]Plugin requests starting of " + fileID);
                        return pluginLoader.startPlugin(fileID);
                    },
                    stop: function (fileID = "") {
                        console.log("[Plugin]Plugin requests stopping of " + fileID);
                        return pluginLoader.stopPlugin(fileID);
                    },
                    getInitialPluginState: function (fileID = "") {
                        console.log("[Plugin]Plugin requests initial state of " + fileID);
                        return pluginLoader.getInitialPluginState(fileID);
                    },
                    setInitialPluginState: function (fileID = "", state = "started") {
                        console.log("[Plugin]Plugin changed initial state of " + fileID + " to " + state);
                        return pluginLoader.setInitialPluginState(fileID, state);
                    },
                    listPlugins: function (includeParent = true) {
                        return pluginLoader.listPlugins(includeParent);
                    },
                    getPlugin: function (fileID = "", includeParent = true) {
                        var plugin = Object.assign({}, pluginLoader.getPlugin(fileID, includeParent));
                        plugin.start = function () {
                            console.log("Plugins are not allowed to call another plugin's start function!");
                            return false;
                        };
                        plugin.stop = function () {
                            console.log("Plugins are not allowed to call another plugin's stop function!");
                            return false;
                        };
                        plugin.load = function () {
                            console.log("Plugins are not allowed to call another plugin's load function!");
                            return false;
                        };
                        plugin.unload = function () {
                            console.log("Plugins are not allowed to call another plugin's unload function!");
                            return false;
                        };
                        return plugin;
                    },
                    getPluginInfo: function (fileID = "", includeParent = true) {
                        return pluginLoader.getPluginInfo(fileID, includeParent);
                    },
                    isPluginLoaded: function (fileID = "", includeParent = true) {
                        return pluginLoader.isPluginLoaded(fileID, includeParent);
                    },
                    getLoadedPlugins: function (includeParent = true) {
                        return pluginLoader.getLoadedPlugins(includeParent);
                    },
                    isPluginStarted: function (fileID = "", includeParent = true) {
                        return pluginLoader.isPluginStarted(fileID, includeParent);
                    },
                    getStartedPlugins: function (includeParent = true) {
                        return pluginLoader.getStartedPlugins(includeParent);
                    },
                    events: pmEmitter
                };
                _api.pluginManager = PMAPI;
            }

            if (_parentPl) {
                eventListeners.parentPluginLoad.set(this, parentPluginLoaded.bind(this));
                eventListeners.parentPluginStart.set(this, parentPluginStarted.bind(this));
                eventListeners.parentPluginStop.set(this, parentPluginStopped.bind(this));
                eventListeners.parentPluginUnload.set(this, parentPluginUnloaded.bind(this));
                _parentPl.getPmEmitter().on("pluginLoaded", eventListeners.parentPluginLoad.get(this));
                _parentPl.getPmEmitter().on("pluginStarted", eventListeners.parentPluginStart.get(this));
                _parentPl.getPmEmitter().on("pluginStopped", eventListeners.parentPluginStop.get(this));
                _parentPl.getPmEmitter().on("pluginUnloaded", eventListeners.parentPluginUnload.get(this));
            }
            eventListeners.pluginLoad.set(this, pluginLoaded.bind(this));
            eventListeners.pluginStart.set(this, pluginStarted.bind(this));
            eventListeners.pluginStop.set(this, pluginStopped.bind(this));
            eventListeners.pluginUnload.set(this, pluginUnloaded.bind(this));
            pmEmitter.on("pluginLoaded", eventListeners.pluginLoad.get(this));
            pmEmitter.on("pluginStarted", eventListeners.pluginStart.get(this));
            pmEmitter.on("pluginStopped", eventListeners.pluginStop.get(this));
            pmEmitter.on("pluginUnloaded", eventListeners.pluginUnload.get(this));

            properties.api.set(pluginLoader, _api);
            properties.apiVersion.set(pluginLoader, _apiVersion);
            properties.fileExt.set(pluginLoader, _fileExt);
            properties.parent.set(pluginLoader, _parentPl);
            properties.basedir.set(pluginLoader, _baseDir);
            properties.pluginsdir.set(pluginLoader, _baseDir + PLUGIN_DIR);
            properties.loadedPlugins.set(pluginLoader, {});
            properties.startedPlugins.set(pluginLoader, {});
            properties.dependencyTree.set(pluginLoader, {});
            properties.delayedPlugins.set(pluginLoader, []);
            properties.loadAttempts.set(pluginLoader, {});
            properties.storage.set(pluginLoader, _storage);
            properties.pmEmitters.set(pluginLoader, pmEmitter);

            if (!fs.existsSync(properties.pluginsdir.get(this))) {
                fs.mkdirSync(properties.pluginsdir.get(this));
            }
        }
        destroy() {
            var parent = properties.parent.get(this);
            if (parent) {
                parent.getPmEmitter().removeListener("pluginLoaded", eventListeners.parentPluginLoad.get(this));
                parent.getPmEmitter().removeListener("pluginStarted", eventListeners.parentPluginStart.get(this));
                parent.getPmEmitter().removeListener("pluginStopped", eventListeners.parentPluginStop.get(this));
                parent.getPmEmitter().removeListener("pluginUnloaded", eventListeners.parentPluginUnload.get(this));
            }
            properties.pmEmitters.get(this).removeAllListeners();

            for (let property of properties) {
                property.delete(this);
            }
            for (let listener of eventListeners) {
                listener.delete(this);
            }
        }

        getPmEmitter() {
            return properties.pmEmitters.get(this);
        }

        listPlugins(includeParent = true) {
            var parent = properties.parent.get(this);
            var fileExt = properties.fileExt.get(this);
            var files = fs.readdirSync(properties.pluginsdir.get(this));
            files = files.filter((item) => {
                return item.toLowerCase().endsWith(fileExt);
            });
            if (parent && includeParent) files = files.concat(parent.listPlugins());
            return files;
        }

        getPlugin(fileID = "", includeParent = true) {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            var fileExt = properties.fileExt.get(this);
            var loadedPlugins = properties.loadedPlugins.get(this);
            var parent = properties.parent.get(this);

            if (!fileID.toLowerCase().endsWith(fileExt)) fileID += fileExt;

            var loadedPluginKeys = this.listPlugins();
            var loadedPluginResolvedFileID = loadedPluginKeys.filter(function (item) {
                return item.toLowerCase() === fileID.toLowerCase();
            })[0];

            if (loadedPluginResolvedFileID) fileID = loadedPluginResolvedFileID;

            if (loadedPlugins[fileID]) {
                return loadedPlugins[fileID];
            }

            if (parent && includeParent) {
                if (parent.getPlugin(fileID, includeParent)) {
                    return parent.getPlugin(fileID, includeParent);
                }
            }

            var pluginFile = properties.pluginsdir.get(this) + "/" + fileID;
            if (!fs.existsSync(pluginFile)) {
                throw new FileNotFoundError(fileID);
            }

            var plugin = null;
            try {
                plugin = reload(pluginFile);
            } catch (ex) {
                if (ex instanceof SyntaxError) {
                    throw new PluginSyntaxError(ex);
                } else {
                    throw new InvalidPluginError("Failed to load plugin '" + fileID + "': " + ex + "\n" + ex.stack);
                }
            }

            if (!plugin.metaInf) {
                throw new InvalidPluginError("Plugin is missing metaInf block", fileID);
            }

            return plugin;
        }

        getPluginInfo(fileID = "", includeParent = false) {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            var plugin = this.getPlugin(fileID, includeParent);
            if (!plugin) return null;
            var pluginMetaInfo = plugin.metaInf;
            return {
                Name: pluginMetaInfo.name || "Unnamed Plugin",
                Version: pluginMetaInfo.version || "0.0.0",
                Description: pluginMetaInfo.description || "No Description available",
                Author: pluginMetaInfo.author || "",
                Dependencies: pluginMetaInfo.dependencies || {},
                StorageOptions: pluginMetaInfo.storageOptions || {},
                APIVersion: pluginMetaInfo.apiVersionRequired || "*",
                PluginDependencies: pluginMetaInfo.pluginDependencies || {},
                StayLoadedOnDepdencyLoss: pluginMetaInfo.stayLoadedOnDependencyLoss || false
            };
        }

        getLoadedPlugins(includeParent = true) {
            var plugins = [];
            var parent = properties.parent.get(this);
            var loadedPlugins = properties.loadedPlugins.get(this);
            if (parent && includeParent) loadedPlugins = loadedPlugins.concat(parent.getLoadedPlugins(), includeParent);
            for (var plugin in loadedPlugins) {
                plugins.push(plugin);
            }
            return plugins;
        }
        isPluginLoaded(fileID = "", includeParent = true) {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            if (!fileID.toLowerCase().endsWith(properties.fileExt.get(this))) fileID += properties.fileExt.get(this);
            var loadedPlugins = this.getLoadedPlugins(includeParent);
            loadedPlugins = loadedPlugins.map(function (item) {
                return item.toLowerCase();
            });
            return loadedPlugins.indexOf(fileID.toLowerCase()) !== -1;
        }

        getStartedPlugins(includeParent = true) {
            var plugins = [];
            var parent = properties.parent.get(this);
            var startedPlugins = properties.startedPlugins.get(this);
            if (parent && includeParent) startedPlugins = startedPlugins.concat(parent.getStartedPlugins(), includeParent);
            for (var plugin in startedPlugins) {
                plugins.push(plugin);
            }
            return plugins;
        }
        isPluginStarted(fileID = "", includeParent = true) {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            if (!fileID.toLowerCase().endsWith(properties.fileExt.get(this))) fileID += properties.fileExt.get(this);
            var loadedPlugins = this.getStartedPlugins(includeParent);
            var loadedPlugins = loadedPlugins.map(function (item) {
                return item.toLowerCase();
            });
            return loadedPlugins.indexOf(fileID.toLowerCase()) !== -1;
        }

        getInitialPluginState(fileID = "") {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            if (!fileID.toLowerCase().endsWith(properties.fileExt.get(this))) fileID += properties.fileExt.get(this);
            return (properties.storage.get(this).getItemSync("state_" + fileID) || "started").toLowerCase();
        }
        setInitialPluginState(fileID = "", state = "started") {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            if (!fileID.toLowerCase().endsWith(properties.fileExt.get(this))) fileID += properties.fileExt.get(this);
            properties.storage.get(this).setItemSync("state_" + fileID, state.toLowerCase());
        }
        getLoadingQueue() {
            return properties.delayedPlugins.get(this);
        }

        allDependenciesSatisfied(fileID = "", pluginInfo = null) {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            if (!pluginInfo) pluginInfo = this.getPluginInfo(fileID);
            for (let depName in pluginInfo.PluginDependencies) {
                let dep = pluginInfo.PluginDependencies[depName];
                dep.name = depName.toLowerCase();
                if (!dep.name.endsWith(properties.fileExt.get(this))) dep.name += properties.fileExt.get(this);
                dep.state = (dep.state || "loaded").toLowerCase();
                dep.optional = dep.optional || false;
                dep.version = dep.version || "*";
                let depInfo;
                try {
                    depInfo = this.getPluginInfo(dep.name, true);
                } catch (error) {
                    if (!(error instanceof FileNotFoundError)) throw error;
                    else if (dep.optional) continue;

                }
                if ((!depInfo || !semver.satisfies(depInfo.Version, dep.version)) && !dep.optional)
                    throw new MissingDependency(fileID, dep);

                if (dep.state === "started") {
                    if (!this.isPluginStarted(dep.name, true)) {
                        return false;
                    }
                } else {
                    if (!this.isPluginLoaded(dep.name, true)) {
                        return false;
                    }
                }
            }
            return true;
        }

        loadPlugin(fileID = "") {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            if (!fileID.toLowerCase().endsWith(properties.fileExt.get(this))) fileID += properties.fileExt.get(this);

            if (this.isPluginLoaded(fileID))
                throw new PluginAlreadyLoadedError(`[${LOGTAG}]Plugin ${fileID} already loaded!`);

            var pluginInfo = this.getPluginInfo(fileID);

            if (!semver.satisfies(properties.apiVersion.get(this), pluginInfo.APIVersion))
                throw new ApiVersionMismatch(fileID, properties.apiVersion.get(this), pluginInfo.APIVersion);

            if (!this.allDependenciesSatisfied(fileID, pluginInfo)) {
                properties.delayedPlugins.get(this).push({
                    plugin: fileID,
                    log: true
                });
                return false;
            }

            let depTree = properties.dependencyTree.get(this);
            for (let dep in pluginInfo.PluginDependencies) {
                if (!depTree[dep]) depTree[dep] = [];
                depTree[dep].push(fileID);
            }

            injectDependencies(pluginInfo.Dependencies);

            var plugin = this.getPlugin(fileID);

            var storageOptions = pluginInfo.StorageOptions;
            storageOptions.dir = properties.basedir.get(this) + "/storage/plugins/" + fileID;
            var pluginStore = nodePersist.create(storageOptions);
            pluginStore.initSync();

            if (plugin.load)
                plugin.load(properties.api.get(this), pluginStore, fileID);

            properties.loadedPlugins.get(this)[fileID] = plugin;

            setTimeout(properties.pmEmitters.get(this).emit.bind(properties.pmEmitters.get(this), "pluginLoaded", fileID, {
                parent: false,
                pluginInfo: pluginInfo
            }), 0);

            return true;
        }
        unloadPlugin(fileID = "") {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            if (!fileID.toLowerCase().endsWith(properties.fileExt.get(this))) fileID += properties.fileExt.get(this);

            if (!this.isPluginLoaded(fileID))
                throw new PluginNotLoadedError(`[${LOGTAG}]Plugin ${fileID} is not loaded!`);
            if (this.isPluginStarted(fileID))
                throw new PluginStillStartedError(`[${LOGTAG}]Plugin ${fileID} is still started!`);

            var pluginInfo = this.getPluginInfo(fileID);
            var plugin = this.getPlugin(fileID);

            if (plugin.unload)
                plugin.unload();

            delete properties.loadedPlugins.get(this)[fileID];

            setTimeout(properties.pmEmitters.get(this).emit.bind(properties.pmEmitters.get(this), "pluginUnloaded", fileID, {
                parent: false,
                pluginInfo: pluginInfo
            }), 0);

            return true;
        }

        startPlugin(fileID = "") {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            if (!fileID.toLowerCase().endsWith(properties.fileExt.get(this))) fileID += properties.fileExt.get(this);

            if (!this.isPluginLoaded(fileID))
                throw new PluginNotLoadedError(`[${LOGTAG}]Plugin ${fileID} is not loaded!`);
            if (this.isPluginStarted(fileID))
                throw new PluginAlreadyStartedError(`[${LOGTAG}]Plugin ${fileID} is already started!`);

            var pluginInfo = this.getPluginInfo(fileID);
            var plugin = this.getPlugin(fileID);

            if (plugin.start)
                plugin.start();

            properties.startedPlugins.get(this)[fileID] = true;

            setTimeout(properties.pmEmitters.get(this).emit.bind(properties.pmEmitters.get(this), "pluginStarted", fileID, {
                parent: false,
                pluginInfo: pluginInfo
            }), 0);

            return true;
        }
        stopPlugin(fileID = "") {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            if (!fileID.toLowerCase().endsWith(properties.fileExt.get(this))) fileID += properties.fileExt.get(this);

            if (!this.isPluginLoaded(fileID))
                throw new PluginNotLoadedError(`[${LOGTAG}]Plugin ${fileID} is not loaded!`);
            if (!this.isPluginStarted(fileID))
                throw new PluginNotStartedError(`[${LOGTAG}]Plugin ${fileID} is not started!`);

            var pluginInfo = this.getPluginInfo(fileID);
            var plugin = this.getPlugin(fileID);

            if (plugin.stop)
                plugin.stop();

            delete properties.startedPlugins.get(this)[fileID];

            setTimeout(properties.pmEmitters.get(this).emit.bind(properties.pmEmitters.get(this), "pluginStarted", fileID, {
                parent: false,
                pluginInfo: pluginInfo
            }), 0);

            return true;
        }

        deleteStorage(fileID = "") {
            if (!fileID) throw new InvalidPluginError("No plugin specified");

            if (!fileID.toLowerCase().endsWith(properties.fileExt.get(this))) fileID += properties.fileExt.get(this);

            var isPluginStarted = this.isPluginStarted(fileID, false);
            var isPluginLoaded = this.isPluginLoaded(fileID, false);

            if (isPluginStarted)
                this.stopPlugin(fileID);
            if (isPluginLoaded)
                this.unloadPlugin(fileID);

            var tmpStore = nodePersist.create({ dir: properties.basedir.get(this) + "/storage/plugins/" + fileID });
            tmpStore.initSync();
            tmpStore.clearSync();

            if (isPluginLoaded)
                this.loadPlugin(fileID);
            if (isPluginStarted)
                this.startPlugin(fileID);

            return true;
        }
    }

    let exportData = {};
    exportData = PluginLoader2;
    exportData.InvalidPluginError = InvalidPluginError;
    exportData.PluginSyntaxError = PluginSyntaxError;
    exportData.PluginAlreadyLoadedError = PluginAlreadyLoadedError;
    exportData.PluginAlreadyStartedError = PluginAlreadyStartedError;
    exportData.PluginStillStartedError = PluginStillStartedError;
    exportData.PluginNotLoadedError = PluginNotLoadedError;
    exportData.PluginNotStartedError = PluginNotStartedError;
    exportData.ApiVersionMismatch = ApiVersionMismatch;
    exportData.MissingDependency = MissingDependency;
    exportData.FileNotFoundError = FileNotFoundError;
    exportData.META = META;
    module.exports = exportData;
})();

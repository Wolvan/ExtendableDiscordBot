# Extendable Discord Bot
### An extendable bot for your Discord Server


[![NPM](https://nodei.co/npm/extendable-discord-bot.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/extendable-discord-bot/)
<br>
<br>

Want to play around with this bot or have questions? Join the Extendable Bot Discord!<br>[![Join the Discord](https://img.shields.io/discord/355051497773596673.svg)](https://discord.gg/pprTuP3)

**Like this bot?**<br>
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=BRE3GL99PBX3L)


## Introduction
This is an extendable bot for Discord chats. By itself it does nothing, that's where Plugins come in handy. Drop plugin files into the `/plugins` directory, load them from the bot console (or by restarting completely) and enjoy it's functionality.

## Features
* Lightweight: Being a NodeJS app makes it easily deployable everywhere! Even on low power servers
* Console commands allow you to administrate the bot easily
* Plugin API: The bot doesn't really do anything by itself, you install Plugins for functionality. The following plugins come pre-installed:
    * `advancedRandom.dbot2.js` A library with more advanced random number generation algorithms
	* `rollDice.dbot2.js` An dice rolling script that allows to roll any number of dice
	* `help.dbot2.js` Shows help text when using the help command
	* `welcome.dbot2.js` Use custom messages to greet or say goodbye to users on your server
	* `messageOutput.dbot2.js` Print messages from chats to your console
	* `requestQ.dbot2.js` A queue plugin for requests or commissions. Also handy for reminders
    * `credits.dbot2.js` Information about where to find out more about this bot

## Install the bot

You can install the bot in two different ways: Directly from the npm repository, globally, which requires you to find the install location to add new plugins or change the config but makes starting the bot possible from anywhere, or you install it locally into a folder which means you can only start it from there but makes plugin installation easier.

### from npm (globally)
1. Install [NodeJS](https://nodejs.org/en/) with npm
2. Use `npm install -g extendable-discord-bot` from a command prompt or terminal
3. Install Plugins
4. Run it with `discord-bot [-e|-p|-t|-f|-c|-d|--help]`
5. Use the `help` command for a list of commands when the bot is running
6. **Optional**: Change settings in config.json
7. Use `reloadconfig` to apply changes from the config file

### from GitHub (locally)
1. Install [NodeJS](https://nodejs.org/en/) with npm
2. Clone this repository or download the source as .zip file
3. Open a command prompt or terminal and navigate to the folder you cloned the repository to
4. Run `npm install` from a command prompt or terminal
5. Install Plugins
6. Run the bot with `node main.js [-e|-p|-t|-f|-c|-d|--help]`
7. Use the `help` command for a list of commands when the bot is running
8. **Optional**: Change settings in config.json
9. Use `reloadconfig` to apply changes from the config file

## Install plugins
Plugin installation is easy! Download the file with the extension `.dbot2.js` and put it in the `/plugins` directory of the bot. Load it by typing `plugins enable <filename>` or by restarting the bot.

## For Developers
Want to write your own Plugin for the bot? That's great!
Easiest is to check existing plugins on how they are written, but you can also check the Wiki of this repository, it should give all the information you should need. I'll also provide a plugin template which you can use.
Make sure that your plugin has the file extension `.dbot2.js`.
Plugin Pull Requests are welcome of course.

Wanna work on the bot itself? Go ahead and fork the repository, make your changes and open a Pull Request back into here!

Got any other questions? [Join the Extendable Bot Discord](https://discord.gg/pprTuP3), I should be available there most of the time.

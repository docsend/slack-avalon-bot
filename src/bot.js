'use strict';
const rx = require('rx');
const _ = require('lodash');

const Slack = require('@slack/client');
const SlackApiRx = require('./slack-api-rx');
const M = require('./message-helpers');
const Avalon = require('./avalon');

class Bot {
  // Public: Creates a new instance of the bot.
  //
  // token - An API token from the bot integration
  constructor(token) {
    this.slack = new Slack.RtmClient(token, {
      logLevel: process.env.LOG_LEVEL || 'error',
      dataStore: new Slack.MemoryDataStore(),
      autoReconnect: true,
      autoMark: true
    });
    this.api = new Slack.WebClient(token);

    this.gameConfig = Avalon.DEFAULT_CONFIG;
    this.gameConfigParams = ['timeout', 'mode'];
  }

  // Public: Brings this bot online and starts handling messages sent to it.
  login() {
    this.slack
      .on(Slack.CLIENT_EVENTS.RTM.AUTHENTICATED, (auth) => {
        this.selfname = auth.self.name;
        console.log(`Welcome to Slack. You are ${auth.self.name} of ${auth.team.name}`);
      })
      .on(Slack.CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, () => this.onClientOpened())
      .on(Slack.CLIENT_EVENTS.UNABLE_TO_RTM_START, err => console.trace('Error emitted:',err))
      .start();

    this.respondToMessages();
  }

  // Private: Listens for messages directed at this bot that contain the word
  // 'deal,' and poll players in response.
  //
  // Returns a {Disposable} that will end this subscription
  respondToMessages() {
    let messages = rx.Observable.fromEvent(this.slack, Slack.RTM_EVENTS.MESSAGE);

    rx.Observable.fromEvent(this.slack, Slack.RTM_EVENTS.CHANNEL_JOINED).subscribe(e => {
      this.slack.sendMessage(e.channel, this.welcomeMessage());
    });

    let atMentions = messages.where(e => e.text && e.text.toLowerCase().match(this.selfname));

    let disp = new rx.CompositeDisposable();
        
    disp.add(this.handleStartGameMessages(messages));
    return disp;
  }

  includeRole(role) {
    this.excludeRole(role);
    this.gameConfig.specialRoles.push(role);
  }

  excludeRole(role) {
    let index = this.gameConfig.specialRoles.indexOf(role);
    if (index >= 0) {
      this.gameConfig.specialRoles.splice(index, 1);
      return true;
    }
    return false;
  }
  
  // Private: Looks for messages directed at the bot that contain the word
  // "deal." When found, start polling players for a game.
  //
  // messages - An {Observable} representing messages posted to a channel
  //
  // Returns a {Disposable} that will end this subscription
  handleStartGameMessages(messages) {
    let store = this.slack.dataStore;
    let trigger = messages.where(e => e.text && e.text.toLowerCase().match(/^play (avalon|resistance)|dta/i));
    trigger.map(e => store.dms[e.channel]).where(channel => !!channel).do(channel => {
      this.slack.sendMessage('Message to a channel to play avalon/resistance.', channel.id);
    }).subscribe();

    return trigger.map(e => {
      this.gameConfig.resistance = e.text.match(/resistance/i);
      return {
        channel: store.channels[e.channel] || store.groups[e.channel],
        initiator: e.user
      };
    }).where(starter => !!starter.channel)
      .where(starter => {
        if (this.isPolling) {
          return false;
        } else if (this.game) {
          this.slack.sendMessage('Another game is in progress, quit that first.', channel.id);
          return false;
        }
        return true;
      })
      .flatMap(starter => this.pollPlayersForGame(messages, starter.channel, starter.initiator, starter.playerNames))
      .flatMap(starter => {
        this.isPolling = false;
        this.addBotPlayers(starter.players);
        
        return this.startGame(starter.players, messages, starter.channel);
      })
      .subscribe();
  }

  // atMentions - An {Observable} representing messages directed at the bot
  //
  // Returns a {Disposable} that will end this subscription
  handleAtMessages(atMentions, command, handler) {
    command = command.toLowerCase();
    return atMentions.where(e => e.user != this.slack.self.id)
      .where(e => e.text && e.text.toLowerCase().match(`[^\\s]+\\s+${command}`))
      .subscribe(e => {
        let channel = this.slack.dataStore.getChannelGroupOrDMByID(e.channel);
        let tokens = e.text.split(/[\s,]+/).slice(2);
        handler(tokens, channel);
      });
  }

  // Posts a message to the channel with some timeout, that edits
  // itself each second to provide a countdown.
  //
  // channel - The channel to post in
  // formatMessage - A function that will be invoked once per second with the
  //                 remaining time, and returns the formatted message content
  // scheduler - The scheduler to use for timing events
  // timeout - The duration of the message, in seconds
  //
  // Returns an {Observable} sequence that signals expiration of the message
  postMessageWithTimeout(channel, formatMessage, scheduler, timeout) {
    let sendMessage = rx.Observable.fromCallback(this.slack.sendMessage, this.slack);

    let timeExpired = sendMessage(formatMessage(timeout), channel.id)
      .flatMap(payload => {
        return rx.Observable.timer(0, 1000, scheduler)
          .take(timeout + 1)
          .do((x) => {
            this.api.chat.update(payload[1].ts, channel.id, formatMessage(`${timeout - x}`));
          })
      })
      .publishLast();

    return timeExpired;
  }
  
  // Private: Polls players to join the game, and if we have enough, starts an
  // instance.
  //
  // messages - An {Observable} representing messages posted to the channel
  // channel - The channel where the deal message was posted
  //
  // Returns an {Observable} that signals completion of the game 
  pollPlayersForGame(messages, channel, initiator, specialChars, scheduler, timeout) {
    scheduler = scheduler || rx.Scheduler.timeout;
    timeout = timeout || 60;
    this.isPolling = true;

    if (this.gameConfig.resistance) {
      this.slack.sendMessage('Who wants to play Resistance? https://amininima.files.wordpress.com/2013/05/theresistance.png', channel.id);
    } else {
      this.slack.sendMessage('Who wants to play Avalon? https://cf.geekdo-images.com/images/pic1398895_md.jpg', channel.id);
    }

    // let formatMessage = t => [
    //   'Respond with:',
    //   '\t`include percival,morgana,mordred,oberon,lady` to include special roles',
    //   '\t`add <player1>,<player2>` to add players',
    //   `\t\`yes\` to join${M.timer(t)}.`
    // ].join('\n');
    let formatMessage = t => `Respond with *'yes'* in this channel${M.timer(t)}.`;
    let timeExpired = this.postMessageWithTimeout(channel, formatMessage, scheduler, timeout);

    // Look for messages containing the word 'yes' and map them to a unique
    // user ID, constrained to `maxPlayers` number of players.
    let pollPlayers = messages.where(e => e.text && e.text.toLowerCase().match(/\byes\b|dta/i))
      .map(e => e.user)
      .map(id => this.slack.dataStore.getUserByID(id));
    timeExpired.connect();

    let addPlayers = messages//.where(e => e.user == initiator)
      .where(e => e.text && e.text.trim().match(/add /i))
      .map(e => e.text.split(/[,\s]+/).slice(1))
      .flatMap(playerNames => {
        let errors = [];
        let players = playerNames.map(name => {
          let player = this.slack.dataStore.getUserByName(name.toLowerCase());
          if (!player) {
            errors.push(`Cannot find player ${name}`);
          }
          return player;
        }).filter(player => !!player);
        // players.add(this.slack.getUserById(id));
        if (errors.length) {
          this.slack.sendMessage(errors.join('\n'), channel.id);
        }
        return rx.Observable.fromArray(players);
      })

    let newPlayerStream = rx.Observable.merge(pollPlayers, addPlayers)
      .takeUntil(timeExpired);

    return newPlayerStream.bufferWithTime(300)
      .reduce((players, newPlayers) => {
        if (newPlayers.length) {
          let messages = [];
          let joinedAlready = [];
          newPlayers = newPlayers.filter(player => {
            if (players.find(p => p.id == player.id)) {
              joinedAlready.push(player);
              return false;
            }
            return true;
          });
          if (joinedAlready.length) {
            messages.push(`${M.pp(joinedAlready)} ${joinedAlready.length > 1 ? 'are' : 'is'} already in the game.`);
          }
          if (players.length + newPlayers.length > Avalon.MAX_PLAYERS) {
            let excessPlayers = newPlayers.slice(Avalon.MAX_PLAYERS);
            newPlayers = newPlayers.slice(0, Avalon.MAX_PLAYERS);
            messages.push(`${M.pp(newPlayers)} ${newPlayers.length > 1 ? 'have' : 'has'} joined the game.`);
            messages.push(`${M.pp(excessPlayers)} cannot join because game is full.`);
          } else if (newPlayers.length) {
            messages.push(`${M.pp(newPlayers)} ${newPlayers.length > 1 ? 'have' : 'has'} joined the game.`);
          }

          players.splice.apply(players,[0,0].concat(newPlayers));
          
          if (players.length > 1 && players.length < Avalon.MAX_PLAYERS) {
            messages.push(`${players.length} players ${M.pp(players)} are in game so far.`);
          } else if (players.length == Avalon.MAX_PLAYERS) {
            messages.push(`Maximum ${players.length} players ${M.pp(players)} are in game so far.`);
          }
          this.slack.sendMessage(messages.join('\n'), channel.id);
        }
        return players;
      }, [])
      .map(players => { return{ channel: channel, players: players}})
  }

  // Private: Starts and manages a new Avalon game.
  //
  // players - The players participating in the game
  // messages - An {Observable} representing messages posted to the channel
  // channel - The channel where the game will be played
  //
  // Returns an {Observable} that signals completion of the game 
  startGame(players, messages, channel) {
    if (!channel) {
      players = players.map(name => this.slack.dataStore.getUserByName(name));
      messages = rx.Observable.fromEvent(this.slack, Slack.RTM_EVENTS.MESSAGE);
      channel = this.getChannels()[0];
    }

    if (players.length < Avalon.MIN_PLAYERS) {
      // TODO: send status back to webpage
      this.slack.sendMessage(`Not enough players for a game. Avalon requires ${Avalon.MIN_PLAYERS}-${Avalon.MAX_PLAYERS} players.`, channel.id);
      return;
    }

    let game = this.game = new Avalon(this.slack, this.api, messages, channel, players);
    _.extend(game, this.gameConfig);

    // Listen for messages directed at the bot containing 'quit game.'
    let quitGameDisp = messages.where(e => e.text && e.text.match(/^quit game/i))
      .take(1)
      .subscribe(e => {
        // TODO: Should poll players to make sure they all want to quit.
        let player = this.slack.getUserByID(e.user);
        this.slack.sendMessage(`${M.formatAtUser(player)} has decided to quit the game.`, channel.id);
        game.endGame(`${M.formatAtUser(player)} has decided to quit the game.`);
      });

    return SlackApiRx.openDms(this.slack, this.api, players)
      .flatMap(playerDms => rx.Observable.timer(2000)
        .flatMap(() => game.start(playerDms)))
      .do(() => {
        quitGameDisp.dispose();
        this.game = null;
      });
  }

  // Private: Adds AI-based players (primarily for testing purposes).
  //
  // players - The players participating in the game
  addBotPlayers(players) {
  }

  welcomeMessage() {
    return `Hi! I can host Avalon games. Type \`play avalon\` to play.`
  }

  getChannels() {
    let store = this.slack.dataStore;
    return _.keys(store.channels)
      .map(k => store.channels[k])
      .filter(c => c.is_member);
  }

  // Private: Save which channels and groups this bot is in and log them.
  onClientOpened() {
    let store = this.slack.dataStore;
    let channels = _.keys(store.channels)
      .map(k => store.channels[k])
      .filter(c => c.is_member);

    let groups = _.keys(store.groups)
      .map(k => store.groups[k])
      .filter(g => g.is_open && !g.is_archived);
      
    let dms = _.keys(store.dms)
      .map(k => store.dms[k])
      .filter(dm => dm.is_open);

    if (channels.length > 0) {
      console.log(`You are in: ${channels.map(c => c.name).join(', ')}`);
    } else {
      console.log('You are not in any channels.');
    }

    if (groups.length > 0) {
      console.log(`As well as: ${groups.map(g => g.name).join(', ')}`);
    }
    
    if (dms.length > 0) {
      console.log(`Your open DM's: ${dms.map(dm => store.getUserById(dm.user).name).join(', ')}`);
    }

    this._loggedOn = true;
  }

  isLoggedOn() {
    return this._loggedOn;
  }

  getPotentialPlayers() {
    if (!this.isLoggedOn()) {
      return [];
    }
    return _.filter(this.slack.dataStore.users, user => !user.is_bot && user.name != 'slackbot' && !user.deleted);
  }
}

module.exports = Bot;

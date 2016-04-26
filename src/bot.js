'use strict';
const rx = require('rx');
const _ = require('lodash');

const Slack = require('slack-client');
const SlackApiRx = require('./slack-api-rx');
const M = require('./message-helpers');
const Avalon = require('./avalon');

class Bot {
  // Public: Creates a new instance of the bot.
  //
  // token - An API token from the bot integration
  constructor(token) {
    this.slack = new Slack(token, true, true);
    
    this.gameConfig = Avalon.DEFAULT_CONFIG;
    this.gameConfigParams = ['timeout', 'mode'];
  }

  // Public: Brings this bot online and starts handling messages sent to it.
  login() {
    this.slack
      .on('open', () => this.onClientOpened())
      .on('error', err => console.trace('Error emitted:',err))
      .login();

    this.respondToMessages();
  }

  // Private: Listens for messages directed at this bot that contain the word
  // 'deal,' and poll players in response.
  //
  // Returns a {Disposable} that will end this subscription
  respondToMessages() {
    let messages = rx.Observable.fromEvent(this.slack, 'message')
      .where(e => e.type === 'message');

    rx.Observable.fromEvent(this.slack, 'message').where(e => e.subtype === 'channel_join').subscribe(e => {
      let channel = this.slack.getChannelGroupOrDMByID(e.channel);
      channel.send(this.welcomeMessage());
    });

    let atMentions = messages.where(e => e.text && e.text.toLowerCase().match(this.slack.self.name));

    let disp = new rx.CompositeDisposable();
        
    disp.add(this.handleDealGameMessages(messages));
 
    disp.add(this.handleAtMessages(atMentions,'help',(tokens, channel) => {
      let gameMode = this.gameConfig.resistance ? 'Resistance' : `Avalon with ${this.gameConfig.specialRoles.join(', ').toUpperCase()}`;
      let lines = [
        `*Game mode*:\t${gameMode}`,
        ...(this.gameConfig.lady ? ['*Lady of the Lake* enabled'] : []),
        `*${_.capitalize(this.gameConfig.order)}* order`,
        '*Usage*:',
        '\t`roles`:\tShow what roles for each amount of players are set to',
        '\t`add <role>`:\tadd special roles (morgana, percival, mordred, oberon, lady [of the lake])',
        '\t`remove <role>`:\tremove special roles',
        '\t`set <turn|random> order`:\tSet turn or random order'
      ];
      channel.send(lines.join('\n'));
    }));

    disp.add(this.handleAtMessages(atMentions,'roles',(tokens, channel) => {
      let messages = [];
      for (let i = Avalon.MIN_PLAYERS; i <= Avalon.MAX_PLAYERS; i++) {
        let assigns = Avalon.getAssigns(i, this.gameConfig.specialRoles)
          .map(role => (role != 'bad' && role != 'good') ? role.toUpperCase() : role)
        messages.push(`${i} players: ${assigns.join(', ')}`);
      }
      channel.send(messages.join('\n'))
    }));

    disp.add(this.handleAtMessages(atMentions,'add',(tokens, channel) => {
      let specialRoles = tokens.map(role => role.toLowerCase().trim());
      let valid = false;
      let messages = [];
      let index = 0;
      if (specialRoles.indexOf('morgana') >= 0) {
        messages.push(`Added MORGANA to roles (which includes PERCIVAL)`);
        this.includeRole('morgana');
        this.includeRole('percival');
        valid = true;
      } else if (specialRoles.indexOf('percival') >= 0) {
        messages.push(`Added PERCIVAL to roles`);
        this.includeRole('percival');
        valid = true;
      }
      if (specialRoles.indexOf('mordred') >= 0) {
        messages.push(`Added MORDRED to roles`);
        this.includeRole('mordred');
        valid = true;
      }
      if (specialRoles.indexOf('oberon') >= 0) {
        messages.push(`Added OBERON to roles`);
        this.includeRole('oberon');
        valid = true;
      }
      if (specialRoles.indexOf('lady') >= 0) {
        messages.push(`Added LADY OF THE LAKE`);
        this.gameConfig.lady = true;
        valid = true;
      }
      if (!valid) {
        messages.push('Invalid input, only morgana, percival, mordred, oberon, and lady are recognized');
      }
      let printRoles = this.gameConfig.specialRoles.map(role => role.toUpperCase()).join(', ');
      messages.push(`Special roles: ${printRoles}`);
      channel.send(messages.join('\n'));
    }));

    disp.add(this.handleAtMessages(atMentions,'remove', (tokens,channel) => {
      let specialRoles = tokens.map(role => role.toLowerCase().trim());
      let valid = false;
      let messages = [];
      let index = 0;
      if (specialRoles.indexOf('percival') >= 0) {
        if (this.excludeRole('morgana')) {
          messages.push(`Removed PERCIVAL from roles (also removed dependent role MORGANA)`);
        } else {
          messages.push(`Removed PERCIVAL from roles`);
        }
        this.excludeRole('percival');
        valid = true;
      } else if (specialRoles.indexOf('morgana') >= 0) {
        this.excludeRole('morgana');
        messages.push(`Removed MORGANA from roles`);
        valid = true;
      }
      if (specialRoles.indexOf('mordred') >= 0) {
        messages.push(`Removed MORDRED from roles`);
        this.excludeRole('mordred');
        valid = true;
      }
      if (specialRoles.indexOf('oberon') >= 0) {
        messages.push(`Removed OBERON from roles`);
        this.excludeRole('oberon');
        valid = true;
      }
      if (specialRoles.indexOf('lady') >= 0) {
        messages.push(`Removed LADY OF THE LAKE`);
        this.gameConfig.lady = false;
        valid = true;
      }
      if (!valid) {
        messages.push('Invalid input, only morgana, percival, mordred, oberon, and lady are recognized');
      }
      let printRoles = this.gameConfig.specialRoles.map(role => role.toUpperCase()).join(', ');
      messages.push(`Special roles: ${printRoles}`);
      channel.send(messages.join('\n'));
    }));

    disp.add(this.handleAtMessages(atMentions,'set',(tokens, channel) => {
      if (tokens.length >= 2 && tokens[1] == 'order') {
        if (tokens[0] == 'random') {
          this.gameConfig.order = 'random';
          channel.send('Set random order for the leader');
        } else {
          this.gameConfig.order = 'turn';
          channel.send('Set turn order for the leader');
        }
      }
    }));
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
  handleDealGameMessages(messages) {
    let trigger = messages.where(e => e.text && e.text.toLowerCase().match(/^play (avalon|resistance)/i));
    trigger.map(e => this.slack.dms[e.channel]).where(channel => !!channel).do(channel => {
      channel.send(`Message to a channel to play avalon/resistance.`);
    }).subscribe();

    return trigger.map(e => {
      this.gameConfig.resistance = e.text.match(/resistance/i);
      return {
        channel: this.slack.channels[e.channel] || this.slack.groups[e.channel],
        initiator: e.user
      };
    }).where(starter => !!starter.channel)
      .where(starter => {
        if (this.isPolling) {
          return false;
        } else if (this.isGameRunning) {
          starter.channel.send('Another game is in progress, quit that first.');
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
        let channel = this.slack.getChannelGroupOrDMByID(e.channel);
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
    let timeoutMessage = channel.send(formatMessage(timeout));

    let timeExpired = rx.Observable.timer(0, 1000, scheduler)
      .take(timeout + 1)
      .do((x) => timeoutMessage.updateMessage(formatMessage(`${timeout - x}`)))
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
      channel.send('Who wants to play Resistance? https://amininima.files.wordpress.com/2013/05/theresistance.png');
    } else {
      channel.send('Who wants to play Avalon? https://cf.geekdo-images.com/images/pic1398895_md.jpg');
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
    let pollPlayers = messages.where(e => e.text && e.text.toLowerCase().match(/\byes\b/))
      .map(e => e.user)
      .map(id => this.slack.getUserByID(id));
    timeExpired.connect();

    let addPlayers = messages//.where(e => e.user == initiator)
      .where(e => e.text && e.text.trim().match(/add /i))
      .map(e => e.text.split(/[,\s]+/).slice(1))
      .flatMap(playerNames => {
        let errors = [];
        let players = playerNames.map(name => {
          let player = this.slack.getUserByName(name.toLowerCase());
          if (!player) {
            errors.push(`Cannot find player ${name}`);
          }
          return player;
        }).filter(player => !!player);
        // players.add(this.slack.getUserById(id));
        if (errors.length) {
          channel.send(errors.join('\n'));
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
          channel.send(messages.join('\n'));
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
      players = players.map(name => this.slack.getUserByName(name));
      messages = rx.Observable.fromEvent(this.slack, 'message').where(e => e.type === 'message');
      channel = this.channels[0];
    }

    if (players.length < Avalon.MIN_PLAYERS) {
      channel.send(`Not enough players for a game. Avalon requires ${Avalon.MIN_PLAYERS}-${Avalon.MAX_PLAYERS} players.`);
      return rx.Observable.return(null);
    }

    channel.send(`${players.length} players (${M.pp(players)}) started a game. Say \`spectate\` to watch.`);
    this.isGameRunning = true;
    
    let game = new Avalon(this.slack, messages, players);
    _.extend(game, this.gameConfig);

    // Listen for messages directed at the bot containing 'quit game.'
    let quitGameDisp = messages.where(e => e.text && e.text.match(/^quit game/i))
      .take(1)
      .subscribe(e => {
        // TODO: Should poll players to make sure they all want to quit.
        let player = this.slack.getUserByID(e.user);
        channel.send(`${M.formatAtUser(player)} has decided to quit the game.`);
        game.endGame(`${M.formatAtUser(player)} has decided to quit the game.`);
      });

    let spectator;
    let spectateGame = messages
      .where(e => e.channel == channel.id)
      .where(e => e.text && e.text.match(/spectate/i))
      .where(e => {
        if (players.some(player => player.id == e.user)) {
          channel.send('You are already in the game');
          return false;
        }
        if (game.spectators.some(spectator => spectator.id == e.user)) {
          channel.send('You are already spectating the game');
          return false;
        }
        return true;
      })
      .flatMap(e => SlackApiRx.openDms(this.slack, [spectator = this.slack.getUserByID(e.user)]))
      .subscribe(playerDms => game.addSpectator(spectator, playerDms[spectator.id]));
    
    return SlackApiRx.openDms(this.slack, players)
      .flatMap(playerDms => rx.Observable.timer(2000)
        .flatMap(() => game.start(playerDms)))
      .do(() => {
        quitGameDisp.dispose();
        spectateGame.dispose();
        this.isGameRunning = false;
      });
  }

  // Private: Adds AI-based players (primarily for testing purposes).
  //
  // players - The players participating in the game
  addBotPlayers(players) {
  }

  welcomeMessage() {
    return `Hi! I can host Avalon games. Type \`play avalon\` to play or \`${this.slack.self.name} help\` for help.`
  }

  // Private: Save which channels and groups this bot is in and log them.
  onClientOpened() {
    this.channels = _.keys(this.slack.channels)
      .map(k => this.slack.channels[k])
      .filter(c => c.is_member);

    this.groups = _.keys(this.slack.groups)
      .map(k => this.slack.groups[k])
      .filter(g => g.is_open && !g.is_archived);
      
    this.dms = _.keys(this.slack.dms)
      .map(k => this.slack.dms[k])
      .filter(dm => dm.is_open);

    console.log(`Welcome to Slack. You are ${this.slack.self.name} of ${this.slack.team.name}`);

    if (this.channels.length > 0) {
      console.log(`You are in: ${this.channels.map(c => c.name).join(', ')}`);
    } else {
      console.log('You are not in any channels.');
    }

    if (this.groups.length > 0) {
      console.log(`As well as: ${this.groups.map(g => g.name).join(', ')}`);
    }
    
    if (this.dms.length > 0) {
      console.log(`Your open DM's: ${this.dms.map(dm => dm.name).join(', ')}`);
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
    return _.filter(this.slack.users, user => !user.is_bot && user.name != 'slackbot' && !user.deleted);
  }
}

module.exports = Bot;

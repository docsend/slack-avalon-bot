'use strict';
const rx = require('rx');
const _ = require('lodash');
const SlackApiRx = require('./slack-api-rx');
const M = require('./message-helpers');
require('string_score');

rx.config.longStackSupport = true;

const ROLES = {
  'bad': ':red_circle: Minion of Mordred',
  'good': ':large_blue_circle: Loyal Servent of Arthur',
  'assassin': ':crossed_swords: THE ASSASSIN :red_circle: Minion of Mordred',
  'oberon': ':alien: OBERON :red_circle: Minion of Mordred',
  'morgana': ':japanese_ogre: MORGANA :red_circle: Minion of Mordred. You pose as MERLIN',
  'mordred': ':smiling_imp: MORDRED :red_circle: Unknown to MERLIN',
  'percival': ':cop: PERCIVAL :large_blue_circle: Loyal Servent of Arthur',
  'merlin': ':angel: MERLIN :large_blue_circle: Loyal Servent of Arthur'
};
const ROLE_ASSIGNS = [
  ['bad', 'bad', 'good', 'good', 'good'],
  ['bad', 'bad', 'good', 'good', 'good', 'good'],
  ['bad', 'bad', 'bad', 'good', 'good', 'good', 'good'],
  ['bad', 'bad', 'bad', 'good', 'good', 'good', 'good', 'good'],
  ['bad', 'bad', 'bad', 'good', 'good', 'good', 'good', 'good', 'good'],
  ['bad', 'bad', 'bad', 'bad', 'good', 'good', 'good', 'good', 'good', 'good']
];

const ORDER = ['first', 'second', 'third', 'fourth', 'last'];

const QUEST_ASSIGNS = [
  [{n:2,f:1},{n:3,f:1},{n:2,f:1},{n:3,f:1},{n:3,f:1}],
  [{n:2,f:1},{n:3,f:1},{n:3,f:1},{n:3,f:1},{n:4,f:1}],
  [{n:2,f:1},{n:3,f:1},{n:3,f:1},{n:4,f:2},{n:4,f:1}],
  [{n:3,f:1},{n:4,f:1},{n:4,f:1},{n:5,f:2},{n:5,f:1}],
  [{n:3,f:1},{n:4,f:1},{n:4,f:1},{n:5,f:2},{n:5,f:1}],
  [{n:3,f:1},{n:4,f:1},{n:4,f:1},{n:5,f:2},{n:5,f:1}]
];

class Avalon {
  static get MIN_PLAYERS() {
    return 5;
  }

  static get MAX_PLAYERS() {
    return 10;
  }

  static get DEFAULT_CONFIG() {
    return {
      resistance: false,
      lady: false,
      order: 'turn',
      specialRoles: ['percival','morgana']
    };
  }

  static getAssigns(numPlayers, specialRoles, resistance) {
    resistance = resistance || false;
    let assigns = ROLE_ASSIGNS[numPlayers - Avalon.MIN_PLAYERS].slice(0);
    if (!resistance) {
      assigns[assigns.indexOf('good')] = 'merlin';
      let specialEvils = specialRoles.filter(role => role != 'percival');
      if (specialEvils.length < specialRoles.length) {
        assigns[assigns.indexOf('good')] = 'percival';
      }
      let bad = 0;
      assigns = assigns.map((role,i) => role == 'bad' && bad < specialEvils.length ? specialEvils[bad++] : role);
      let badIndex = assigns.indexOf('bad');
      if (badIndex >= 0) {
        assigns[badIndex] = 'assassin';
      }
    }
    return assigns;
  }

  constructor(slack, messages, players, scheduler) {
    scheduler = scheduler || rx.Scheduler.timeout;
    this.slack = slack;
    this.messages = messages;
    this.players = players;
    this.spectators = [];
    this.scheduler = scheduler;
    this.gameEnded = new rx.Subject();
    _.extend(this, Avalon.DEFAULT_CONFIG);
  }

  start(playerDms, timeBetweenRounds) {
    timeBetweenRounds = timeBetweenRounds || 1000;
    this.isRunning = true;
    this.questNumber = 0;
    this.rejectCount = 0;
    this.progress = [];
    this.playerDms = playerDms;
    this.date = new Date();

    this.chatSubscription = this.messages
      .where(e => playerDms[e.user] && e.channel == playerDms[e.user].id || this.spectators[e.user] && e.channel == this.spectators[e.user].id)
      .where(e => e.text)
      .subscribe(e => {
        if (this.isRunning) {
          if (e.text.match(/^quit game/i)) {
            return;
          }
        } else {
          this.chat(e.user, e.text);
          return;
        }
        let player = this.players.filter(player => player.id == e.user);
        if (player.length && player[0].action) {
          let text = e.text.trim().toLowerCase();
          if (player[0].action == 'voting' && text.score('approve', .5) <= .5 &&  text.score('reject', .5) <= .5) {
            this.chat(e.user, e.text);
          } else if (player[0].action == 'sending' && !text.match(/^send/)) {
            this.chat(e.user, e.text);
          } else if (player[0].action == 'killing' && !text.match(/^kill/)) {
            this.chat(e.user, e.text);
          }
        } else {
          this.chat(e.user, e.text);
        }
      });

    let players = this.players = this.playerOrder(this.players);
    let assigns = this.getRoleAssigns(Avalon.getAssigns(players.length, this.specialRoles, this.resistance));
    this.leader = players[0];

    let evils = this.evils = [];
    for (let i=0; i < players.length; i++) {
      let player = players[i];
      player.role = assigns[i];
      if (player.role != 'good' && player.role != 'merlin' && player.role != 'percival') {
        evils.push(player);
      }
    }
    if (!this.resistance) {
      this.assassin = this.getAssassin();
    }

    let knownEvils = evils.filter(player => player.role != 'oberon');
    for (let player of this.players) {
      let message = `\`\`\`${_.times(60,_.constant('\n')).join('')}\`\`\` You are ${ROLES[player.role]}`;
      if (this.assassin.id == player.id && player.role != 'assassin') {
        message += ' as well as :crossed_swords: THE ASSASSIN';
      }
      if (player.role == 'merlin') {
        let evilButMordred = evils.filter(p => p.role != 'mordred');
        if (evilButMordred.length == evils.length) {
          message += `. ${M.pp(evils)} are evil.`;
        } else {
          message += `. ${M.pp(evilButMordred)} are evil. MORDRED is hidden.`;
        }
      } else if (player.role == 'percival') {
        let merlins = players.filter(p => p.role == 'morgana' || p.role == 'merlin');
        if (merlins.length == 1) {
          message += `. ${M.formatAtUser(merlins[0])} is MERLIN`;
        } else if (merlins.length > 1) {
          message += `. One of ${M.pp(merlins)} is MERLIN`;
        }
      } else if (player.role != 'good' && player.role != 'oberon') {
        message += `. ${M.pp(knownEvils)} are evil`;
      }
      message += ` \`\`\`${_.times(60,_.constant('\n')).join('')}Scroll up to see your role\`\`\``;
      this.playerDms[player.id].send(message);
    }

    this.subscription = rx.Observable.return(true)
      .flatMap(() => this.playRound())
      .repeat()
      .takeUntil(this.gameEnded)
      .subscribe();
      
    return this.gameEnded;
  }

  chat(speaker, message) {
    let user = this.playerDms[speaker];
    let format = user.spectator || M.formatAtUser(this.players.filter(player => player.id == speaker)[0]);
    for (let id of Object.keys(this.playerDms)) {
      this.playerDms[id].send(`${format}: ${message}`);
    }
  }

  getRoleAssigns(roles) {
    return _.shuffle(roles);
  }

  playerOrder(players) {
    return _.shuffle(players);
  }

  getAssassin() {
    let assassin = this.evils.filter(player => player.role == 'assassin');
    if (assassin.length) {
      assassin = assassin[0];
    } else {
      assassin = _.shuffle(this.evils)[0];
    }
    return assassin;
  }

  quit() {
    this.gameEnded.onNext(true);
    this.gameEnded.onCompleted();
    this.isRunning = false;
    this.subscription.dispose();
    setTimeout(() => this.chatSubscription.dispose(), 60000);
  }

  playRound() {
    return rx.Observable.fromArray(this.players)
      .concatMap(player => this.deferredActionForPlayer(player));
  }

  addSpectator(spectator, playerDm) {
    if (!this.isRunning) {
      return;
    }
    if (!this.spectators.some(s => s.id == spectator.id)) {
      spectator.spectator = M.formatAtUser(spectator);
      this.playerDms[spectator.id] = playerDm;
      let message = `Current quest progress: ${this.getStatus(true)}`;
      let order = this.players.map(p => p.id == this.leader.id ? `*${M.formatAtUser(p)}*` : M.formatAtUser(p))
      this.dm(spectator, `${message}\nPlayer order: ${order}`, null, 'start');
      this.spectators.push(spectator);
    }
  }

  revealRoles(excludeMerlin) {
    excludeMerlin = excludeMerlin || false;
    let lines = [`${M.pp(this.evils)} are :red_circle: Minions of Mordred.`];
    let reveals = {};
    for (let player of this.players) {
      if (player.role == 'merlin' && !excludeMerlin) {
        reveals['merlin'] = `${M.formatAtUser(player)} is :angel: MERLIN.`;
      } else if (player.role == 'percival') {
        reveals['percival'] = `${M.formatAtUser(player)} is :cop: PERCIVAL.`;
      } else if (player.role == 'morgana') {
        reveals['morgana'] = `${M.formatAtUser(player)} is :japanese_ogre: MORGANA.`;
      } else if (player.role == 'mordred') {
        reveals['mordred'] = `${M.formatAtUser(player)} is :smiling_imp: MORDRED.`;
      } else if (player.role == 'oberon') {
        reveals['oberon'] = `${M.formatAtUser(player)} is :alien: OBERON.`;
      }
    }
    return lines.concat(Object.keys(ROLES).filter(role => !!reveals[role]).map(role => reveals[role]).join(' ')).join('\n');
  }

  endGame(message, color, current) {
    current = current || false;
    let status = `Quest Results: ${this.getStatus(current)}`;
    message += `\n${status}\n${this.revealRoles()}`;
    this.broadcast(message, color, 'end');
    this.quit();
  }

  dm(player, message, color, special) {
    if (player instanceof Array) {
      return player.forEach(p => this.dm(p, message, color, special));
    }
    let attachment = { fallback: message, text: message, mrkdwn: true, mrkdwn_in: ['pretext','text'] };
    if (color) attachment.color = color;
    if (special == 'start') {
      attachment.pretext = `*${player.spectator ? 'Spectating' : 'Start'} Avalon Game* (${this.date})`;
      let prependText = `${this.evils.length} out of ${this.players.length} players are evil.`;
      let specialRoles = this.players.filter(p => p.role != 'good' && p.role != 'bad' || p.role != 'assassin');
      if (specialRoles.length) {
        specialRoles = specialRoles.map(p => p.role);
        specialRoles = Object.keys(ROLES).filter(role => specialRoles.indexOf(role) >= 0).map(role => {
          switch(role) {
            case 'merlin': return ':angel: MERLIN';
            case 'percival': return ':cop: PERCIVAL';
            case 'morgana': return ':japanese_ogre: MORGANA';
            case 'mordred': return ':smiling_imp: MORDRED';
            case 'oberon': return ':alien: OBERON';
          }
        }).filter(role => !!role).join(', ');
        attachment.text = `${prependText}\nSpecial roles: ${specialRoles}\n${message}`;
      } else {
        attachment.text = `${prependText}\n${message}`;
      }
      attachment.thumb_url = 'https://cf.geekdo-images.com/images/pic1398895_md.jpg';
    } else if (special == 'end') {
      attachment.pretext = `*End Avalon Game* (${this.date})`;
    }
    return this.playerDms[player.id].postMessage({
      username: 'avalon-bot',
      icon_emoji: ':crystal_ball:',
      attachments: [attachment]
    });
  }

  dmMessages(player) {
    return this.messages.where(e => e.channel == this.playerDms[player.id].id);
  }

  questAssign() {
    return QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][this.questNumber];
  }

  deferredActionForPlayer(player, timeToPause) {
    timeToPause = timeToPause || 3000;
    return rx.Observable.defer(() => {
      return rx.Observable.timer(timeToPause, this.scheduler).flatMap(() => {
        let questAssign = this.questAssign();
        let f = '';
        if (questAssign.f > 1) {
          f = '(2 fails required) ';
        }
        let message = ` ${questAssign.n} players ${f}to go on the ${ORDER[this.questNumber]} quest.`;
        let status = `Quest progress: ${this.getStatus(true)}\n`;
        let order = this.players.map(p => p.id == player.id ? `*${M.formatAtUser(p)}*` : M.formatAtUser(p))
        status += `Player order: ${order}\n`;
        let special = this.questNumber == 0 && this.rejectCount == 0 ? 'start' : '';

        this.dm(player,`${status}*You* choose${message} (.eg \`send name1, name2\`)`, '#a60', special);
        this.dmOtherPlayers(player,`${status}${M.formatAtUser(player)} chooses${message}`, null, special);
        player.action = 'sending';

        return this.choosePlayersForQuest(player)
          .concatMap(votes => {
            let printQuesters = M.pp(this.questPlayers);
            for (let player of this.players) {
              player.action = null;
            }
            if (votes.approved.length > votes.rejected.length) {
              this.broadcast(`The ${ORDER[this.questNumber]} quest with ${printQuesters} going was approved by ${M.pp(votes.approved)} (${votes.rejected.length ? M.pp(votes.rejected) : 'no one'} rejected)`)
              this.rejectCount = 0;
              return rx.Observable.defer(() => rx.Observable.timer(timeToPause, this.scheduler).flatMap(() => {
                return this.runQuest(this.questPlayers, player);
              }));
            }
            this.rejectCount++;
            this.broadcast(`The ${ORDER[this.questNumber]} quest with ${printQuesters} going was rejected (${this.rejectCount}) by ${M.pp(votes.rejected)} (${votes.approved.length ? M.pp(votes.approved) : 'no one'} approved)`)
            if (this.rejectCount >= 5) {
              this.endGame(`:red_circle: Minions of Mordred win due to the ${ORDER[this.questNumber]} quest rejected 5 times!`, '#e00', true);
            }
            return rx.Observable.return(true);
          })
      });
    });
  }

  broadcast(message, color, special) {
    this.dm(this.players, message, color, special);
    this.dm(this.spectators, message, color, special);
  }

  dmOtherPlayers(excludePlayer, message, color, special) {
    let players;
    if (excludePlayer instanceof Array) {
      players = _.differenceBy(this.players, excludePlayer, (player) => player.id);
    } else {
      players = this.players.filter(player => player.id != excludePlayer.id);
    }
    this.dm(players, message, color, special);
    this.dm(this.spectators, message, color, special);
  }

  choosePlayersForQuest(player) {
    let questAssign = this.questAssign();
    return this.messages
      .where(e => e.user === player.id)
      .map(e => e.text)
      .where(text => text && text.match(/^send /i))
      .map(text => text.split(/[,\s]+/).slice(1))
      .map(chosen => {
        if (chosen.length != questAssign.n) {
          return [];
        }
        let questPlayers = [];
        for (let p of this.players) {
          if (chosen.some(name => name.toLowerCase() == p.name.toLowerCase())) {
            questPlayers.push(p);
          }
        }
        return questPlayers;
      })
      .where(questPlayers => {
        if (questPlayers.length != questAssign.n) {
          this.dm(player, `You need to send ${questAssign.n} players. (You only chosen ${questPlayers.length} valid players)`, '#a60');
        }
        return questPlayers.length == questAssign.n;
      })
      .concatMap(questPlayers => {
        this.questPlayers = questPlayers;
        this.dm(player, `You've chosen ${M.pp(questPlayers)} to go on the ${ORDER[this.questNumber]} quest.\nVote *approve* or *reject*`, '#555');
        let message = `${M.formatAtUser(player)} is sending ${M.pp(questPlayers)} to the ${ORDER[this.questNumber]} quest.`;
        this.dm(this.players.filter(p => p.id != player.id), `${message}\nVote *approve* or *reject*`, '#555');
        this.dm(this.spectators, `${message}\nAwaiting votes...`);
        for (let player of this.players) {
          player.action = 'voting';
        }
        return rx.Observable.fromArray(this.players)
          .map(p => this.dmMessages(p)
            .where(e => e.user === p.id && e.text)
            .map(e => e.text.trim().toLowerCase())
            .where(text => text.score('approve', .5) > .5 || text.score('reject', .5) > .5)
            .map(text => { return { player: p, approve: text.score('approve', .5) > .5 }})
            .take(1))
          .mergeAll()
      })
      .take(this.players.length)
      .reduce((acc, vote) => {
        if (vote.approve) {
          acc.approved.push(vote.player);
        } else {
          acc.rejected.push(vote.player);
        }
        if (acc.approved.length + acc.rejected.length < this.players.length) {
          let voted = acc.approved.concat(acc.rejected);
          let message = `${voted.length} out of ${this.players.length} voted for the ${ORDER[this.questNumber]} quest.`;
          this.dm(voted, `${message} Your vote is in!`);
          _.differenceBy(this.players, voted).forEach(player => this.dm(player, `${message} Awaiting your vote...`));
        }
        return acc;
      }, { approved: [], rejected: [] })
  }

  getStatus(current) {
    current = current || false;
    let status = this.progress.map((res,i) => {
      let questAssign = QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][i];
      let circle = res == 'good' ? ':large_blue_circle:': ':red_circle:';
      return `${questAssign.n}${questAssign.f > 1 ? '*' : ''}${circle}`;
    });
    if (current) {
      let questAssign = QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][this.questNumber];
      status.push(`${questAssign.n}${questAssign.f > 1 ? '*' : ''}:black_circle:`);
    }
    if (status.length < ORDER.length) {
      status = status.concat(_.times(ORDER.length - status.length, (i) => {
        let questAssign = QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][i + status.length];
        return `${questAssign.n}${questAssign.f > 1 ? '*' : ''}:white_circle:`;
      }));
    }
    return status.join(',');
  }

  runQuest(questPlayers, leader) {
    let message = `${M.pp(questPlayers)} are going on the ${ORDER[this.questNumber]} quest.`
    message += `\nCurrent quest progress: ${this.getStatus(true)}`;
    let order = this.players.map(p => p.id == leader.id ? `*${M.formatAtUser(p)}*` : M.formatAtUser(p))
    message += `\nPlayer order: ${order}`;
    this.leader = leader;
    this.dm(questPlayers, `${message}\nYou can *succeed* or *fail* for this mission. Chat is disabled in the meantime.`, '#ea0');
    this.dmOtherPlayers(questPlayers, `${message}\nWait for the quest results.`);
    for (let player of questPlayers) {
      player.action = 'questing';
    }

    let runners = 0;
    return rx.Observable.fromArray(questPlayers)
      .map(player => this.dmMessages(player)
        .where(e => e.user === player.id && e.text)
        .map(e => e.text.trim().toLowerCase())
        .where(text => text.score('succeed', .5) > .5 || text.score('fail', .5) > .5)
        .map(text => { return { player: player, fail: text.score('fail', .5) > .5 }})
        .take(1))
      .mergeAll()
      .take(questPlayers.length)
      .reduce((acc, questResult) => {
        if (questResult.fail) {
          acc.failed.push(questResult.player);
        } else {
          acc.succeeded.push(questResult.player);
        }
        if (acc.failed.length + acc.succeeded.length < questPlayers.length) {
          let completed = acc.failed.concat(acc.succeeded);
          let message = `${completed.length} out of ${questPlayers.length} players have completed the ${ORDER[this.questNumber]} quest.`;
          this.dm(completed, `${completed.length} out of ${questPlayers.length} players (including you) have completed the ${ORDER[this.questNumber]} quest.`);
          _.differenceBy(this.players, completed).forEach(player => this.dm(player, `${message} Awaiting your quest completion...`));
        }
        return acc;
      }, { succeeded: [], failed: [] })
      .map(questResults => {
        for (let player of questPlayers) {
          player.action = null;
        }
        if (questResults.failed.length > 0) {
          this.progress.push('bad');
          this.broadcast(`${questResults.failed.length} in (${M.pp(questPlayers)}) failed the ${ORDER[this.questNumber]} quest!`, '#e00');
        } else {
          this.progress.push('good')
          this.broadcast(`${M.pp(questPlayers)} succeeded the ${ORDER[this.questNumber]} quest!`, '#08e');
        }
        this.questNumber++;
        let score = { good: 0, bad: 0 };
        for (let res of this.progress) {
          score[res]++;
        }
        return score;
      })
      .concatMap(score => {
        if (score.bad == 3) {
          this.endGame(`:red_circle: Minions of Mordred win by failing 3 quests!`, '#e00');
        } else if (score.good == 3) {
          let merlin = this.players.filter(player => player.role == 'merlin');
          if (!merlin.length) {
            this.endGame(`:large_blue_circle: Loyal Servents of Arthur win by succeeding 3 quests!`, '#08e');
            return rx.Observable.return(true);
          }
          let assassin = this.assassin;
          merlin = merlin[0];
    
          let status = `Quest Results: ${this.getStatus()}\n`;
          this.broadcast(`${status}Victory is near for :large_blue_circle: Loyal Servents of Arthur for succeeding 3 quests!`);
          return rx.Observable.defer(() => {
            return rx.Observable.timer(1000, this.scheduler).flatMap(() => {
              assassin.action = 'killing';
              this.dm(assassin, `*You* are the :red_circle::crossed_swords:ASSASSIN. Type \`kill <player>\` to attempt to kill MERLIN`, '#e00');
              this.dmOtherPlayers(assassin, `*${M.formatAtUser(assassin)}* is the :red_circle::crossed_swords:ASSASSIN. Awaiting the MERLIN assassination attempt...`);

              return rx.Observable.return(true).flatMap(() => {
                return this.messages
                  .where(e => e.user == assassin.id)
                  .map(e => e.text)
                  .map(text => text && text.match(/^kill (.+)/i))
                  .where(match => match && match[1])
                  .map(match => {
                    let accused = this.players.filter(player => player.name.toLowerCase() == match[1].trim().toLowerCase());
                    if (!accused.length) {
                      this.dm(assassin, `${match[1]} is not a valid player`);
                      return null;
                    }
                    return accused[0];
                  })
                  .where(accused => !!accused)
                  .take(1)
                  .do(accused => {
                    if (accused.role != 'merlin') {
                      this.dm(assassin, `${status}${M.formatAtUser(accused)} is not MERLIN. :angel:${M.formatAtUser(merlin)} is.\n:large_blue_circle: Loyal Servants of Arthur win!\n${this.revealRoles(true)}`, '#08e', 'end');
                      this.dmOtherPlayers(assassin, `${status}:crossed_swords:${M.formatAtUser(assassin)} chose ${M.formatAtUser(accused)} as MERLIN, not :angel:${M.formatAtUser(merlin)}.\n:large_blue_circle: Loyal Servants of Arthur win!\n${this.revealRoles(true)}`, '#08e', 'end');
                    } else {
                      this.dm(assassin, `${status}You chose :angel:${M.formatAtUser(accused)} correctly as MERLIN.\n:red_circle: Minions of Mordred win!\n${this.revealRoles(true)}`, '#e00', 'end');
                      this.dmOtherPlayers(assassin, `${status}:crossed_swords:${M.formatAtUser(assassin)} chose :angel:${M.formatAtUser(accused)} correctly as MERLIN.\n:red_circle: Minions of Mordred win!\n${this.revealRoles(true)}`, '#e00', 'end');
                    }
                    this.quit();
                  });
                });
            });
          });
        }
        return rx.Observable.return(true);
      });
  }
}

module.exports = Avalon;

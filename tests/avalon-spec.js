const rx = require('rx');
const _ = require('lodash');
const assert = require('chai').assert;

const Avalon = require('../src/avalon');

describe('Avalon', function() {
  var game, slack, api, messages, scheduler, players, playerDms, channel, lastMessage;

  beforeEach(function() {
    slack = {
      token: 0xDEADBEEF,
      sendMessage: function(message, id) {
        lastMessage = message.replace(/\n+/g,'\n');
        console.log(`sendMessage(${id}): ${lastMessage}`);
      }
    };
    api = {
      token: 0xDEADBEEF,
      chat: {
        postMessage: function(id, message, data) {
          lastMessage = data.attachments[0].text;
          console.log(`postMessage(${id}): ${lastMessage}`);
        }  
      }
    }
    messages = new rx.Subject();
    messages.subscribe(m => {
      if (m.user && m.text) {
        console.log(`${players.find(p => p.id == m.user).name}: ${m.text}`);
      }
    });
    
    scheduler = new rx.HistoricalScheduler();
    players = [
      { id: 1, name: 'player_1' },
      { id: 2, name: 'player_2' },
      { id: 3, name: 'player_3' },
      { id: 4, name: 'player_4' },
      { id: 5, name: 'player_5' },
      { id: 6, name: 'player_6' },
      { id: 7, name: 'player_7' },
      { id: 8, name: 'player_8' }
    ];

    channel = {
      id: 'channel'
    };
    playerDms = {
      1: { id: 'dm1' },
      2: { id: 'dm2' },
      3: { id: 'dm3' },
      4: { id: 'dm4' },
      5: { id: 'dm5' },
      6: { id: 'dm6' },
      7: { id: 'dm7' },
      8: { id: 'dm8' }
    };

    game = new Avalon(slack, api, messages, channel, players, scheduler);
  });

  afterEach(function() {
    clearTimeout(game.endTimeout);
  });

  function dm(userId, text) {
    messages.onNext({user: userId, channel: playerDms[userId].id, text: text});
  }

  function untilLastQuest() {
    game.start(playerDms, 0);
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/MERLIN/));
    assert(lastMessage.match(/PERCIVAL/));
    assert(lastMessage.match(/MORGANA/));

    messages.onNext({user: game.players[0].id, text: 'send player_1, player_2, player_3'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_3/));

    dm(1, 'approve');
    dm(2, 'approve');
    dm(3, 'approve');
    dm(4, 'reject');
    dm(5, 'reject');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'approve');

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was rejected/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[1].id, text: 'send player_1, player_2, player_3'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_3/));

    dm(1, 'approve');
    dm(2, 'approve');
    dm(3, 'approve');
    dm(4, 'reject');
    dm(5, 'approve');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'approve');

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was approved/));
    scheduler.advanceBy(5000);

    dm(1, 'succeed');
    dm(2, 'succeed');
    dm(3, 'succeed');

    assert(lastMessage.match(/succeeded the first quest/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[2].id, text: 'send player_1, player_2, player_3, player_4'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the second quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_3/));
    assert(lastMessage.match(/player_4/));

    dm(1, 'approve');
    dm(2, 'approve');
    dm(3, 'approve');
    dm(4, 'approve');
    dm(5, 'reject');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'approve');

    assert(lastMessage.match(/second quest/));
    assert(lastMessage.match(/going was approved/));
    scheduler.advanceBy(5000);

    dm(1, 'succeed');
    dm(2, 'succeed');
    dm(3, 'succeed');
    dm(4, 'fail');

    assert(lastMessage.match(/failed the second quest/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[3].id, text: 'send player_1, player_2, player_3, player_4'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the third quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_3/));
    assert(lastMessage.match(/player_4/));

    dm(1, 'approve');
    dm(2, 'approve');
    dm(3, 'approve');
    dm(4, 'approve');
    dm(5, 'reject');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'approve');

    assert(lastMessage.match(/third quest/));
    assert(lastMessage.match(/going was approved/));
    scheduler.advanceBy(5000);

    dm(1, 'succeed');
    dm(2, 'succeed');
    dm(3, 'succeed');
    dm(4, 'fail');

    assert(lastMessage.match(/failed the third quest/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[4].id, text: 'send player_1, player_2, player_3, player_4, player_5'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the fourth quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_3/));
    assert(lastMessage.match(/player_4/));
    assert(lastMessage.match(/player_5/));

    dm(1, 'approve');
    dm(2, 'approve');
    dm(3, 'approve');
    dm(4, 'approve');
    dm(5, 'reject');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'approve');

    assert(lastMessage.match(/fourth quest/));
    assert(lastMessage.match(/going was approved/));
    scheduler.advanceBy(5000);

    dm(1, 'succeed');
    dm(2, 'succeed');
    dm(3, 'succeed');
    dm(4, 'fail');
    dm(5, 'succeed');

    assert(lastMessage.match(/succeeded the fourth quest with 1 fail/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[5].id, text: 'send player_1, player_2, player_3, player_4, player_5'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the last quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_3/));
    assert(lastMessage.match(/player_4/));
    assert(lastMessage.match(/player_5/));

    dm(1, 'approve');
    dm(2, 'approve');
    dm(3, 'approve');
    dm(4, 'approve');
    dm(5, 'reject');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'approve');

    assert(lastMessage.match(/last quest/));
    assert(lastMessage.match(/going was approved/));
    scheduler.advanceBy(5000);
  }
  
  it('good win', function() {
    untilLastQuest();
    dm(1, 'succeed');
    dm(2, 'succeed');
    dm(3, 'succeed');
    dm(4, 'succeed');
    dm(5, 'succeed');

    assert(lastMessage.match(/Victory is near/));
    scheduler.advanceBy(5000);

    var assassin = game.players.filter(player => player.role == 'assassin');
    assert(assassin.length > 0);
    assassin = assassin[0];
    assert(lastMessage.match(assassin.name));

    var merlin = game.players.filter(player => player.role == 'merlin');
    assert(merlin.length > 0);
    messages.onNext({user: assassin.id, text: 'kill '+assassin.name });
    assert(lastMessage.match(/You cannot kill yourself/));

    var goodPerson = game.players.filter(player => player.role == 'good')[0];
    messages.onNext({user: assassin.id, text: 'kill '+goodPerson.name });
    assert(lastMessage.match(/Loyal Servants of Arthur win!/));
  });

  it('assassin win', function() {
    untilLastQuest();
    dm(1, 'succeed');
    dm(2, 'succeed');
    dm(3, 'succeed');
    dm(4, 'succeed');
    dm(5, 'succeed');

    assert(lastMessage.match(/Victory is near/));
    scheduler.advanceBy(5000);

    var assassin = game.players.filter(player => player.role == 'assassin');
    assert(assassin.length > 0);
    assassin = assassin[0];
    assert(lastMessage.match(assassin.name));

    var merlin = game.players.filter(player => player.role == 'merlin');
    assert(merlin.length > 0);
    merlin = merlin[0];
    messages.onNext({user: assassin.id, text: 'kill '+merlin.name });
    assert(lastMessage.match(/Minions of Mordred win!/));
  });

  it('evil win', function() {
    untilLastQuest();
    dm(1, 'succeed');
    dm(2, 'succeed');
    dm(3, 'fail');
    dm(4, 'succeed');
    dm(5, 'fail');

    assert(lastMessage.match(/Minions of Mordred win by failing 3 quests!/));
  });

  it('rejection win', function() {
    game.start(playerDms, 0);
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/MERLIN/));
    assert(lastMessage.match(/PERCIVAL/));
    assert(lastMessage.match(/MORGANA/));

    messages.onNext({user: game.players[0].id, text: 'send player_1, player_2, player_3'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_3/));

    dm(1, 'approve');
    dm(2, 'approve');
    dm(3, 'approve');
    dm(4, 'reject');
    dm(5, 'reject');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'approve');

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was rejected/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[1].id, text: 'send player_4, player_5, player_6'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_4/));
    assert(lastMessage.match(/player_5/));
    assert(lastMessage.match(/player_6/));

    dm(1, 'reject');
    dm(2, 'approve');
    dm(3, 'approve');
    dm(4, 'reject');
    dm(5, 'approve');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'approve');

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was rejected/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[2].id, text: 'send player_7, player_8, player_1'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_7/));
    assert(lastMessage.match(/player_8/));
    assert(lastMessage.match(/player_1/));

    dm(1, 'reject');
    dm(2, 'approve');
    dm(3, 'approve');
    dm(4, 'reject');
    dm(5, 'approve');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'approve');

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was rejected/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[3].id, text: 'send player_1, player_5, player_7'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_5/));
    assert(lastMessage.match(/player_7/));

    dm(1, 'reject');
    dm(2, 'approve');
    dm(3, 'approve');
    dm(4, 'reject');
    dm(5, 'approve');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'approve');

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was rejected/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[4].id, text: 'send player_1, player_2, player_7'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_7/));

    dm(1, 'reject');
    dm(2, 'reject');
    dm(3, 'reject');
    dm(4, 'reject');
    dm(5, 'reject');
    dm(6, 'reject');
    dm(7, 'reject');
    dm(8, 'reject');

    assert(lastMessage.match(/Minions of Mordred win due to the first quest rejected 5 times/));
  });
});

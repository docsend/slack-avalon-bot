const rx = require('rx');
const _ = require('lodash');
const assert = require('chai').assert;

const Avalon = require('../src/avalon');

describe('Avalon', function() {
  var game, slack, messages, scheduler, players, playerDms, channel, lastMessage;

  beforeEach(function() {
    slack = { token: 0xDEADBEEF };
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

    var logFunc = (method, id) => {
      return (msg) => {
        if (method == 'postMessage') {
          lastMessage = msg.attachments[0].text;
        } else {
          lastMessage = msg.replace(/\n+/g,'\n');
        }
        console.log(`${method}(${id}): ${lastMessage}`);
      };
    };

    channel = {
        send: logFunc('send','channel'),
        postMessage: logFunc('postMessage', 'channel')
    };
    playerDms = {
      1: { send: logFunc('send',1), postMessage: logFunc('postMessage', 1) },
      2: { send: logFunc('send',2), postMessage: logFunc('postMessage', 2) },
      3: { send: logFunc('send',3), postMessage: logFunc('postMessage', 3) },
      4: { send: logFunc('send',4), postMessage: logFunc('postMessage', 4) },
      5: { send: logFunc('send',5), postMessage: logFunc('postMessage', 5) },
      6: { send: logFunc('send',6), postMessage: logFunc('postMessage', 6) },
      7: { send: logFunc('send',7), postMessage: logFunc('postMessage', 7) },
      8: { send: logFunc('send',8), postMessage: logFunc('postMessage', 8) }
    };

    game = new Avalon(slack, messages, channel, players, scheduler);
  });

  afterEach(function() {
    clearTimeout(game.endTimeout);
  });

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

    messages.onNext({user: 1, text: 'approve'});
    messages.onNext({user: 2, text: 'approve'});
    messages.onNext({user: 3, text: 'approve'});
    messages.onNext({user: 4, text: 'reject'});
    messages.onNext({user: 5, text: 'reject'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'approve'});

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was rejected/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[1].id, text: 'send player_1, player_2, player_3'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_3/));

    messages.onNext({user: 1, text: 'approve'});
    messages.onNext({user: 2, text: 'approve'});
    messages.onNext({user: 3, text: 'approve'});
    messages.onNext({user: 4, text: 'reject'});
    messages.onNext({user: 5, text: 'approve'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'approve'});

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was approved/));
    scheduler.advanceBy(5000);

    messages.onNext({user: 1, text: 'succeed'});
    messages.onNext({user: 2, text: 'succeed'});
    messages.onNext({user: 3, text: 'succeed'});

    assert(lastMessage.match(/succeeded the first quest/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[2].id, text: 'send player_1, player_2, player_3, player_4'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the second quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_3/));
    assert(lastMessage.match(/player_4/));

    messages.onNext({user: 1, text: 'approve'});
    messages.onNext({user: 2, text: 'approve'});
    messages.onNext({user: 3, text: 'approve'});
    messages.onNext({user: 4, text: 'approve'});
    messages.onNext({user: 5, text: 'reject'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'approve'});

    assert(lastMessage.match(/second quest/));
    assert(lastMessage.match(/going was approved/));
    scheduler.advanceBy(5000);

    messages.onNext({user: 1, text: 'succeed'});
    messages.onNext({user: 2, text: 'succeed'});
    messages.onNext({user: 3, text: 'succeed'});
    messages.onNext({user: 4, text: 'fail'});

    assert(lastMessage.match(/failed the second quest/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[3].id, text: 'send player_1, player_2, player_3, player_4'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the third quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_3/));
    assert(lastMessage.match(/player_4/));

    messages.onNext({user: 1, text: 'approve'});
    messages.onNext({user: 2, text: 'approve'});
    messages.onNext({user: 3, text: 'approve'});
    messages.onNext({user: 4, text: 'approve'});
    messages.onNext({user: 5, text: 'reject'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'approve'});

    assert(lastMessage.match(/third quest/));
    assert(lastMessage.match(/going was approved/));
    scheduler.advanceBy(5000);

    messages.onNext({user: 1, text: 'succeed'});
    messages.onNext({user: 2, text: 'succeed'});
    messages.onNext({user: 3, text: 'succeed'});
    messages.onNext({user: 4, text: 'fail'});

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

    messages.onNext({user: 1, text: 'approve'});
    messages.onNext({user: 2, text: 'approve'});
    messages.onNext({user: 3, text: 'approve'});
    messages.onNext({user: 4, text: 'approve'});
    messages.onNext({user: 5, text: 'reject'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'approve'});

    assert(lastMessage.match(/fourth quest/));
    assert(lastMessage.match(/going was approved/));
    scheduler.advanceBy(5000);

    messages.onNext({user: 1, text: 'succeed'});
    messages.onNext({user: 2, text: 'succeed'});
    messages.onNext({user: 3, text: 'succeed'});
    messages.onNext({user: 4, text: 'fail'});
    messages.onNext({user: 5, text: 'succeed'});

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

    messages.onNext({user: 1, text: 'approve'});
    messages.onNext({user: 2, text: 'approve'});
    messages.onNext({user: 3, text: 'approve'});
    messages.onNext({user: 4, text: 'approve'});
    messages.onNext({user: 5, text: 'reject'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'approve'});

    assert(lastMessage.match(/last quest/));
    assert(lastMessage.match(/going was approved/));
    scheduler.advanceBy(5000);
  }
  
  it('good win', function() {
    untilLastQuest();
    messages.onNext({user: 1, text: 'succeed'});
    messages.onNext({user: 2, text: 'succeed'});
    messages.onNext({user: 3, text: 'succeed'});
    messages.onNext({user: 4, text: 'succeed'});
    messages.onNext({user: 5, text: 'succeed'});

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
    messages.onNext({user: 1, text: 'succeed'});
    messages.onNext({user: 2, text: 'succeed'});
    messages.onNext({user: 3, text: 'succeed'});
    messages.onNext({user: 4, text: 'succeed'});
    messages.onNext({user: 5, text: 'succeed'});

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
    messages.onNext({user: 1, text: 'succeed'});
    messages.onNext({user: 2, text: 'succeed'});
    messages.onNext({user: 3, text: 'fail'});
    messages.onNext({user: 4, text: 'succeed'});
    messages.onNext({user: 5, text: 'fail'});

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

    messages.onNext({user: 1, text: 'approve'});
    messages.onNext({user: 2, text: 'approve'});
    messages.onNext({user: 3, text: 'approve'});
    messages.onNext({user: 4, text: 'reject'});
    messages.onNext({user: 5, text: 'reject'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'approve'});

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was rejected/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[1].id, text: 'send player_4, player_5, player_6'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_4/));
    assert(lastMessage.match(/player_5/));
    assert(lastMessage.match(/player_6/));

    messages.onNext({user: 1, text: 'reject'});
    messages.onNext({user: 2, text: 'approve'});
    messages.onNext({user: 3, text: 'approve'});
    messages.onNext({user: 4, text: 'reject'});
    messages.onNext({user: 5, text: 'approve'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'approve'});

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was rejected/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[2].id, text: 'send player_7, player_8, player_1'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_7/));
    assert(lastMessage.match(/player_8/));
    assert(lastMessage.match(/player_1/));

    messages.onNext({user: 1, text: 'reject'});
    messages.onNext({user: 2, text: 'approve'});
    messages.onNext({user: 3, text: 'approve'});
    messages.onNext({user: 4, text: 'reject'});
    messages.onNext({user: 5, text: 'approve'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'approve'});

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was rejected/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[3].id, text: 'send player_1, player_5, player_7'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_5/));
    assert(lastMessage.match(/player_7/));

    messages.onNext({user: 1, text: 'reject'});
    messages.onNext({user: 2, text: 'approve'});
    messages.onNext({user: 3, text: 'approve'});
    messages.onNext({user: 4, text: 'reject'});
    messages.onNext({user: 5, text: 'approve'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'approve'});

    assert(lastMessage.match(/first quest/));
    assert(lastMessage.match(/going was rejected/));
    scheduler.advanceBy(5000);

    messages.onNext({user: game.players[4].id, text: 'send player_1, player_2, player_7'});
    scheduler.advanceBy(5000);

    assert(lastMessage.match(/to the first quest/));
    assert(lastMessage.match(/player_1/));
    assert(lastMessage.match(/player_2/));
    assert(lastMessage.match(/player_7/));

    messages.onNext({user: 1, text: 'reject'});
    messages.onNext({user: 2, text: 'reject'});
    messages.onNext({user: 3, text: 'reject'});
    messages.onNext({user: 4, text: 'reject'});
    messages.onNext({user: 5, text: 'reject'});
    messages.onNext({user: 6, text: 'reject'});
    messages.onNext({user: 7, text: 'reject'});
    messages.onNext({user: 8, text: 'reject'});

    assert(lastMessage.match(/Minions of Mordred win due to the first quest rejected 5 times/));
  });
});

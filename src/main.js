'use strict';
const fs = require('fs');
const pathToken = process.env.SLACK_AVALON_BOT_TOKEN;
let token;
try {
  token = pathToken || fs.readFileSync('token.txt', 'utf8').trim();
} catch (error) {
  console.log("Your API token should be placed in a 'token.txt' file, which is missing.");
  return;
}

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

const Bot = require('./bot');
const bot = new Bot(token);
bot.login();

app.set('view engine', 'pug');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  if (!bot.isLoggedOn()) {
    res.render('error', { error: 'Avalon Bot is initializing. Reload in a bit...' });
    return;
  } else if (bot.getChannels().length == 0) {
    res.render('error', { error: 'Avalon Bot is in no valid slack channel' });
    return;
  }
  let users = bot.getPotentialPlayers();
  let channels = bot.getChannels();
  res.render('index', { users: users, channels: channels });
});

app.post('/start', (req, res) => {
  if (req.body.players instanceof Array && res.body.channel) {
    if (bot.getChannels().filter(c => c.name == res.body.channel).length == 0) {
      return res.end('failure');
    }
    bot.gameConfig.specialRoles = req.body.roles instanceof Array ? req.body.roles : [];
    let obs = bot.startGame(req.body.players, null, req.body.channel);
    if (obs) {
      obs.subscribe(res.end('success'), res.end('failure'));
    } else {
      res.end('failure');
    }
  } else {
    res.end('failure');
  }
});

app.post('/approve', (req, res) => {
  let dm;
  if (bot.game && req.body.user_id && (dm = bot.game.playerDms[req.body.user_id])) {
    bot.slack.emit('message', { user: req.body.user_id, text: 'approve', type: 'message', channel: dm.id });
  }
  res.end();
});

app.post('/reject', (req, res) => {
  let dm;
  if (bot.game && req.body.user_id && (dm = bot.game.playerDms[req.body.user_id])) {
    bot.slack.emit('message', { user: req.body.user_id, text: 'reject', type: 'message', channel: dm.id });
  }
  res.end();
});

app.post('/succeed', (req, res) => {
  let dm;
  if (bot.game && req.body.user_id && (dm = bot.game.playerDms[req.body.user_id])) {
    bot.slack.emit('message', { user: req.body.user_id, text: 'succeed', type: 'message', channel: dm.id });
  }
  res.end();
});

app.post('/fail', (req, res) => {
  let dm;
  if (bot.game && req.body.user_id && (dm = bot.game.playerDms[req.body.user_id])) {
    bot.slack.emit('message', { user: req.body.user_id, text: 'fail', type: 'message', channel: dm.id });
  }
  res.end();
});

app.listen(process.env.PORT || 5000);

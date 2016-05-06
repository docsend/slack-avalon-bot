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
  } else if (bot.channels.length == 0) {
    res.render('error', { error: 'Avalon Bot is in no valid slack channel' });
    return;
  }
  let users = bot.getPotentialPlayers();
  res.render('index', { users: users }); 
});

app.post('/start', (req, res) => {
  if (req.body.players instanceof Array) {
    bot.gameConfig.specialRoles = req.body.roles instanceof Array ? req.body.roles : [];
    bot.startGame(req.body.players).subscribe(res.end('success'), res.end('failure'));
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
    console.log(req.body)
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

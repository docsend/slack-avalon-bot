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

const Bot = require('./bot');
const bot = new Bot(token);
bot.login();

const express = require('express');
const app = express();
const _ = require('lodash');
const bodyParser = require('body-parser');

app.set('view engine', 'pug');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', function (req, res)  {
  if (!bot.channels) {
    res.render('error', { error: 'Avalon Bot is initializing. Reload in a bit...' });
    return;
  } else if (bot.channels.length == 0) {
    res.render('error', { error: 'Avalon Bot is in no valid slack channel' });
    return;
  }
  let users = _.filter(bot.slack.users, user => !user.is_bot && user.presence == 'active' && user.name != 'slackbot');
  res.render('index', { users: users }); 
});

app.post('/start', function (req, res) {
  if (req.body.players instanceof Array) {
    bot.gameConfig.specialRoles = req.body.roles instanceof Array ? req.body.roles : [];
    bot.startGame(req.body.players).subscribe();  
  }
});

app.listen(process.env.PORT || 5000);

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

app.set('view engine', 'pug');
app.use(express.static('public'));

app.get('/', function (req, res)  {
  let users = _.filter(bot.slack.users, user => !user.is_bot && user.presence == 'active' && user.name != 'slackbot');
  res.render('index', { users: users });
});

app.listen(process.env.PORT || 5000);

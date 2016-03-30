## Slack Avalon Bot
This bot allows you to host Avalon games on Slack!

## Getting Started
1. Create a new [bot integration](https://my.slack.com/services/new/bot)
1. Follow the steps to deploy the bot to Heroku or run it locally
1. The bot will display a welcome message and instructions to use it when invited to a channel

#### One-Click Deploy to Heroku
Click this button:

[![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy)

#### Manual Deploy to Heroku
1. Install [Heroku toolbelt](https://devcenter.heroku.com/articles/getting-started-with-nodejs#set-up)
1. Create a new bot integration (as above)
1. `heroku create`
1. `heroku config:set SLACK_AVALON_BOT_TOKEN=[Your API token]`
1. `git push heroku master`

#### To Run Locally
1. Create a `token.txt` file and paste your API token there
1. `npm install`
1. `node src/main.js`

### Testing
To run tests, simply do:

1. `gulp`
'use strict';
const rx = require('rx');
const Slack = require('@slack/client');

module.exports = class SlackApiRx {
  // Public: Retrieves DM channels for all of the given users, opening any that
  // do not already exist.
  //
  // slackApi - An instance of the Slack client
  // users - The users to fetch DM channels for
  //
  // Returns an {Observable} that signals completion
  static openDms(slack, api, users) {
    let ret = rx.Observable.fromArray(users)
      .flatMap((user) => SlackApiRx.getOrOpenDm(slack, api, user))
      .reduce((acc, x) => {
        acc[x.id] = x.dm;
        return acc;
      }, {})
      .publishLast();

    ret.connect();
    return ret;
  }

  // Private: Checks for the existence of an open DM channel for the user,
  // opens one if necessary, then waits for the `im_open` event and retrieves
  // the DM channel.
  //
  // slackApi - An instance of the Slack client
  // user - The user we are trying to DM with
  //
  // Returns an {Observable} representing the opened channel. This will be an
  // object with two keys: `id` and `dm`. DM will be null if the API call
  // failed for some reason (e.g., an invalid user).
  static getOrOpenDm(slack, api, user) {
    console.log(`Getting DM channel for ${user.name}`);
    let dm = slack.dataStore.getDMByName(user.name);

    // Bot players don't need DM channels; we only talk to humans
    if ((dm && dm.is_open) || user.isBot) {
      return rx.Observable.return({id: user.id, dm: dm});
    }

    console.log(`No open channel found for ${user.name}, opening one using ${user.id}`);

    return SlackApiRx.openDm(slack, api, user)
      .catch(rx.Observable.return({id: user.id, dm: null}));
  }

  // Private: Maps the `im.open` API call into an {Observable}.
  //
  // Returns an {Observable} that signals completion, or an error if the API
  // call fails
  static openDm(slack, api, user) {
    api.dm.open(user.id);
    return rx.Observable.fromEvent(slack, Slack.RTM_EVENTS.IM_OPEN)
      .where(e => e.user == user.id)
      .take(1)
      .map(e => { return { id: e.user, dm: slack.dataStore.getDMByName(user.name) } });
  }
};

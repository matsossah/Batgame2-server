import i18n from './i18n';

// @TODO: Create `hasUsername` column automatically

Parse.Cloud.beforeSave(Parse.User, (request, response) => {
  if (request.object.isNew()) {
    const username = request.object.get('username');
    request.object.set('hasUsername', username !== undefined);
  }
  // @TODO: Check whether user is allowed to modify its username
  response.success();
});

const Match = Parse.Object.extend('Match');
const Round = Parse.Object.extend('Round');
const Game = Parse.Object.extend('Game');

async function afterGameSave(gameObj) {
  const game = await new Parse.Query(Game)
    .include('scores')
    .include('scores.user')
    .get(gameObj.id);

  if (game.get('scores').length === 1) {
    const round = await new Parse.Query(Round)
      .equalTo('games', game)
      .include('games')
      .include('games.scores')
      .first();

    const playerFinished = round.get('games')
      .every(otherGame => otherGame.get('scores').length === 1);
    if (playerFinished) {
      const player = game.get('scores')[0].get('user');
      const matchQuery = new Parse.Query(Match)
        .equalTo('rounds', round)
        .include('participants');
      const match = await matchQuery.first();
      const otherPlayers = match.get('participants')
        .filter(participant =>
          participant.id !== player.id
        );
      Parse.Cloud.useMasterKey();
      const installations = await new Parse.Query(Parse.Installation)
        .containedIn('user', otherPlayers)
        .find();
      await Promise.all(installations.map(installation => {
        const locale = installation.get('localeIdentifier');
        return Parse.Push.send({
          where: new Parse.Query(Parse.Installation).equalTo('objectId', installation.id),
          data: {
            alert: i18n(locale, 'YOUR_TURN', player.get('username')),
          },
        }, {
          useMasterKey: true,
        });
      }));
    }
  }
}

Parse.Cloud.afterSave('Game', (request, response) => {
  afterGameSave(request.object)
    .then(
      () => {
        response.success();
      },
      err => {
        console.error(err);
        response.error();
      }
    );
});

const ROUND_NB = 3;
const GAMES_NB = 3;

function createMatchQuery() {
  return new Parse.Query('Match')
    .include('participants')
    .include('rounds')
    .include('rounds.games')
    .include('rounds.games.scores');
}

async function createRounds() {
  const rounds = [];
  for (let i = 0; i < ROUND_NB; i++) {
    const games = [];
    for (let j = 0; j < GAMES_NB; j++) {
      games.push(new Game({
        scores: [],
        gameName: null,
        gamePicked: false,
      }));
    }

    await Parse.Object.saveAll(games);
    rounds.push(new Round({
      games,
    }));
  }

  await Parse.Object.saveAll(rounds);
  return rounds;
}

// @TODO: Parse isn't a good match for this kind of usage.
// We need a queue so that we can atomically update our match info.
// @TODO: ACLs on matches so that users can only see their own matches.
async function tryToJoinMatch(user) {
  const query = createMatchQuery();
  query.ascending('createdAt');
  query.equalTo('open', true);
  query.notEqualTo('participants', user);

  let match = await query.first();
  if (!match) {
    match = new Match({
      startedBy: user,
      participants: [user],
      rounds: await createRounds(),
      open: true,
    });

    await match.save();
  } else {
    await match.save({ open: false });

    if (match.get('participants').length > 2) {
      // Another user joined the match in between our two requests.
      // Try again.
      return await tryToJoinMatch(user);
    }

    // This empties the participants list on our local model, so we retrieve
    // them again by running a new query on the match.
    match.addUnique('participants', user);
    await match.save();
    // @WORKAROUND: For some reason Parse does not update our current model
    // in-place, so we override the reference.
    match = await createMatchQuery().get(match.id);
  }

  return match;
}

Parse.Cloud.define('joinRandomMatch', (request, response) => {
  if (!request.user) {
    response.error('User must be authenticated.');
    return;
  }

  tryToJoinMatch(request.user)
    .then(match => {
      response.success(match);
    })
    .catch(err => {
      console.error(err);
      response.error();
    });
});

async function joinMatchAgainst(user, username) {
  const opponent = await new Parse.Query(Parse.User)
    .equalTo('username', username)
    .first();

  if (!opponent) {
    return null;
  }

  const match = new Match({
    startedBy: user,
    participants: [user, opponent],
    rounds: await createRounds(),
    open: false,
  });

  await match.save();

  return match;
}

Parse.Cloud.define('joinMatchAgainst', (request, response) => {
  if (!request.user) {
    response.error('User must be authenticated.');
    return;
  }

  if (request.user.username === request.params.username) {
    response.error('Bad request.');
    return;
  }

  joinMatchAgainst(request.user, request.params.username)
    .then(match => {
      if (!match) {
        response.error('Unknown user.');
      } else {
        response.success(match);
      }
    })
    .catch(err => {
      console.error(err);
      response.error();
    });
});

async function addUserToInstallation(user, deviceToken) {
  Parse.Cloud.useMasterKey();
  const query = new Parse.Query(Parse.Installation);
  query.equalTo('deviceToken', deviceToken);

  const installation = await query.first();

  await installation.save({ user });
}

Parse.Cloud.define('addUserToInstallation', (request, response) => {
  const { user } = request;

  if (!user) {
    response.error('User must be authenticated.');
    return;
  }

  const { deviceToken } = request.params;

  if (!deviceToken) {
    response.error('Missing parameter: deviceToken');
    return;
  }

  addUserToInstallation(user, deviceToken)
    .then(
      () => {
        response.success({});
      },
      err => {
        console.error(err);
        response.error('Error while adding user to installation');
      }
    );
});

Parse.Cloud.define('registerInstallation', (request, response) => {
  const { deviceType, deviceToken, localeIdentifier } = request.params;

  if (!deviceType) {
    response.error('Missing parameter: deviceType');
    return;
  }
  if (!deviceToken) {
    response.error('Missing parameter: deviceToken');
    return;
  }
  if (!localeIdentifier) {
    response.error('Missing parameter: localeIdentifier');
    return;
  }

  // Might not be set, will be added later
  const user = request.user;

  Parse.Cloud.useMasterKey();
  const installation = new Parse.Installation({
    deviceToken,
    deviceType,
    localeIdentifier,
    user,
    channels: ['global'],
  });

  installation.save().then(
    () => response.success({}),
    err => {
      console.error(err);
      response.error('Error while saving installation');
    }
  );
});


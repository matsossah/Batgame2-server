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

const ROUND_NB = 3;
const GAMES_NB = 3;

function createMatchQuery() {
  return new Parse.Query('Match')
    .include('participants')
    .include('rounds')
    .include('rounds.games')
    .include('rounds.games.scores');
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
    match = new Match({
      startedBy: user,
      participants: [user],
      rounds,
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
  tryToJoinMatch(request.user)
    .then(match => {
      response.success(match);
    })
    .catch(err => {
      console.log(err);
      response.error();
    });
});

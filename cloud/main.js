// @TODO: Create `hasUsername` column automatically

Parse.Cloud.beforeSave(Parse.User, (request, response) => {
  if (request.object.isNew()) {
    const username = request.object.get('username');
    request.object.set('hasUsername', username !== undefined);
  }
  // @TODO: Check whether user is allowed to modify its username
  response.success();
});

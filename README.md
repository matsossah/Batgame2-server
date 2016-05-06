# batgame-server

## Boostrap

You should have mongodb installed and running.

On OSX:

```
brew update
brew install mongodb
brew services start mongodb
sudo npm install -g parse-dashboard # If you want to use the dashboard
```

```
git clone https://github.com/matsossah/Batgame2-server
cd Batgame2-server
npm install
```

## Starting the server

You must first define the following environment variables:

* `DATABASE_URI` The URI of the Mongo database.
* `APP_ID` The ID of the app.
* `CLIENT_KEY` The app's client key (public).
* `MASTER_KEY` The app's master key (private).
* `HOST` The server's host name.
* `PORT` Port the app should listen on.

Here's an example of development environment variables:

```
export DATABASE_URI="mongodb://localhost:27017/dev"
export APP_ID="MyApp"
export CLIENT_KEY="1234"
export MASTER_KEY="1234"
export HOST="0.0.0.0"
export PORT="8080"
```

## Starting the dashboard

```
parse-dashboard --appId $APP_ID --masterKey $MASTER_KEY --serverURL http://$HOST:$PORT/parse
```
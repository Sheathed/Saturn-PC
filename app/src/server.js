const express = require('express');
const cors = require('cors');
const path = require('path');
const packageJson = require('../package.json');
const fs = require('fs');
const compareVersions = require('compare-versions');
const axios = require('axios').default;
const logger = require('./winston');
const { DeezerAPI, DeezerStream } = require('./deezer');
const { Settings } = require('./settings');
const { Track, Album, Artist, Playlist, DeezerProfile, SearchResults, DeezerLibrary, DeezerPage, Lyrics } = require('./definitions');
const { DownloadManager } = require('./downloads');
const { Integrations } = require('./integrations');
const { DeezerLogin, DeezerLoginException, CookieManager, md5Hex, Env } = require('./deezer_login');

let settings;
let deezer;
let downloadManager;
let integrations;

let sockets = [];

//Express
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../client', 'dist')));
app.use(cors({ origin: 'http://127.0.0.1:10069' }));
//Server
const server = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
    path: '/socket',
    //CORS for webpack debug
    cors: {
        origin: 'http://127.0.0.1:10069',
        methods: ["GET", "POST"],
    }
});

//Get playback info
app.get('/playback', async(req, res) => {
    try {
        let data = await fs.promises.readFile(Settings.getPlaybackInfoPath(), 'utf-8');
        return res.json(data);
        // eslint-disable-next-line no-empty
    } catch (e) {}

    return res.json({});
});

//Save playback info
app.post('/playback', async(req, res) => {
    if (req.body) {
        let data = JSON.stringify(req.body);
        await fs.promises.writeFile(Settings.getPlaybackInfoPath(), data, 'utf-8');
    }
    res.status(200).send('');
});

//Get settings
app.get('/settings', (req, res) => {
    res.json(settings);
});

//Save settings
app.post('/settings', async(req, res) => {
    if (req.body) {
        Object.assign(settings, req.body);
        downloadManager.settings = settings;
        integrations.updateSettings(settings);
        await settings.save();
    }

    res.status(200).send('');
});

//Post with body {"arl": ARL}
app.post('/authorize', async(req, res) => {
    if (!req.body.arl || req.body.arl.length < 100) return res.status(500).send('Invalid ARL');

    //Check if ARL valid
    let electron = deezer.electron;
    deezer = new DeezerAPI(req.body.arl, electron);
    settings.arl = req.body.arl;

    if (await (deezer.authorize())) {
        //Update download manager
        downloadManager.setDeezer(deezer);

        res.status(200).send('OK');
        return;
    }

    res.status(500).send('Invalid ARL / Free Account');
});

app.post('/directlogin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).send('Invalid Credentials');

  let arl;
  try {
    arl = await DeezerLogin.getArlByEmailAndPassword(email, password);

    if (!arl || arl === '') {
      logger.error('Direct login produced no ARL for email', { email });
      return res.status(401).send('Invalid ARL / Login failed');
    }

    return res.status(200).send({ arl });
  } catch (err) {
    // If DeezerLoginException == friendly; otherwise treat as unexpected
    if (err instanceof DeezerLoginException) {
      logger.error('Login failed (DeezerLoginException)', { err: err.toString(), email });
      return res.status(401).send(err.toString());
    } else {
      logger.error('Direct login unexpected error', { err: (err && err.toString) ? err.toString() : err, email });
      return res.status(500).send('Internal Server Error');
    }
  }
});

//Get track by id
app.get('/track/:id', async(req, res) => {
    let data = await deezer.callApi('deezer.pageTrack', { sng_id: req.params.id.toString() });
    res.send(new Track(data.results.DATA));
});

//Get album by id
app.get('/album/:id', async(req, res) => {
    let data = await deezer.callApi('deezer.pageAlbum', { alb_id: req.params.id.toString(), lang: settings.contentLanguage });
    res.send(new Album(data.results.DATA, data.results.SONGS));
});

//Get artist by id
app.get('/artist/:id', async(req, res) => {
    let data = await deezer.callApi('deezer.pageArtist', { art_id: req.params.id.toString(), lang: settings.contentLanguage });
    res.send(new Artist(data.results.DATA, data.results.ALBUMS, data.results.TOP));
});

//Get playlist by id
//start & full query parameters
app.get('/playlist/:id', async(req, res) => {
    //Set anything to `full` query parameter to get entire playlist
    let nb = req.query.full ? 100000 : 50;
    let data = await deezer.callApi('deezer.pagePlaylist', {
        playlist_id: req.params.id.toString(),
        lang: settings.contentLanguage,
        nb: nb,
        start: req.query.start ? parseInt(req.query.start, 10) : 0,
        tags: true
    });
    return res.send(new Playlist(data.results.DATA, data.results.SONGS));
});

//DELETE playlist
app.delete('/playlist/:id', async(req, res) => {
    await deezer.callApi('playlist.delete', { playlist_id: req.params.id.toString() });
    res.sendStatus(200);
});

//POST create playlist
// {
//     desciption,
//     title,
//     type: 0, 1, 2 = public, private, collab
//     track: trackID
// }
app.post('/playlist', async(req, res) => {
    await deezer.callApi('playlist.create', {
        description: req.body.description,
        title: req.body.title,
        status: req.body.type,
        songs: req.body.track ? [
            [req.body.track, 0]
        ] : []
    });

    res.sendStatus(200);
});

//PUT edit playlist, see above create
app.put('/playlist/:id', async(req, res) => {
    await deezer.callApi('playlist.update', {
        description: req.body.description,
        title: req.body.title,
        status: req.body.type,
        playlist_id: parseInt(req.params.id.toString(), 10)
    });
    res.sendStatus(200);
});

//POST track to playlist
//Body {"track": "trackId"}
app.post('/playlist/:id/tracks', async(req, res) => {
    await deezer.callApi('playlist.addSongs', {
        offset: -1,
        playlist_id: req.params.id,
        songs: [
            [req.body.track, 0]
        ]
    });

    res.sendStatus(200);
});

//DELETE track from playlist
//Body {"track": "trackId"}
app.delete('/playlist/:id/tracks', async(req, res) => {
    await deezer.callApi('playlist.deleteSongs', {
        playlist_id: req.params.id,
        songs: [
            [req.body.track, 0]
        ]
    });

    res.sendStatus(200);
});

//Get more albums
//ID = artist id, QP start = offset
app.get('/albums/:id', async(req, res) => {
    let data = await deezer.callApi('album.getDiscography', {
        art_id: parseInt(req.params.id.toString(), 10),
        discography_mode: "all",
        nb: 25,
        nb_songs: 200,
        start: req.query.start ? parseInt(req.query.start, 10) : 0
    });

    let albums = data.results.data.map((a) => new Album(a));
    res.send(albums);
})

//Get tracks from listening history
app.get('/history', async(req, res) => {
    let data = await deezer.callApi('deezer.pageProfile', {
        nb: 200,
        tab: "history",
        user_id: deezer.userId.toString()
    });
    let tracks = data.results.TAB.history.data.map((t) => new Track(t));
    res.send(tracks);
});

//Search, q as query parameter
app.get('/search', async(req, res) => {
    let data = await deezer.callApi('deezer.pageSearch', { query: req.query.q, nb: 100 });
    res.send(new SearchResults(data.results));
});

//Get user profile data
app.get('/profile', async(req, res) => {
    let data = await deezer.callApi('deezer.getUserData');
    let profile = new DeezerProfile(data.results);
    res.send(profile);
});

//Get shuffled library
app.get('/shuffle', async(req, res) => {
    let data = await deezer.callApi('tracklist.getShuffledCollection', {
        nb: 50,
        start: 0
    });
    res.send(data.results.data.map((t) => new Track(t)));
});

//Get list of `type` from library
app.get('/library/:type', async(req, res) => {
    let type = req.params.type;
    //Normal
    if (type != 'tracks') {
        let data = await deezer.callApi('deezer.pageProfile', {
            nb: 50,
            tab: (type == 'tracks') ? 'loved' : type,
            user_id: deezer.userId
        });
        return res.send(new DeezerLibrary(data.results.TAB, type)).end();
    }
    //Tracks
    let data = await deezer.callApi('deezer.pagePlaylist', {
        playlist_id: deezer.favoritesPlaylist,
        lang: settings.contentLanguage,
        nb: 50,
        start: 0,
        tags: true
    });
    res.send(new DeezerLibrary(data.results.SONGS, type));
});

//DELETE from library
app.delete('/library/:type', async(req, res) => {
    let type = req.params.type;
    let id = req.query.id;

    if (type == 'track') await deezer.callApi('favorite_song.remove', { SNG_ID: id });
    if (type == 'album') await deezer.callApi('album.deleteFavorite', { ALB_ID: id });
    if (type == 'playlist') await deezer.callApi('playlist.deleteFavorite', { playlist_id: parseInt(id, 10) });
    if (type == 'artist') await deezer.callApi('artist.deleteFavorite', { ART_ID: id });

    res.sendStatus(200);
});

//PUT (add) to library
app.put('/library/:type', async(req, res) => {
    let type = req.params.type;
    let id = req.query.id;

    if (type == 'track') await deezer.callApi('favorite_song.add', { SNG_ID: id });
    if (type == 'album') await deezer.callApi('album.addFavorite', { ALB_ID: id });
    if (type == 'artist') await deezer.callApi('artist.addFavorite', { ART_ID: id });
    if (type == 'playlist') await deezer.callApi('playlist.addFavorite', { parent_playlist_id: parseInt(id) });

    res.sendStatus(200);
});

//PUT dislike track
app.put('/dislike/:trackid', async(req, res) => {
    let trackid = req.params.trackid;
    await deezer.callApi('favorite_dislike.add', { ID: trackid, TYPE: 'song' });
    res.sendStatus(200);
});

//Get streaming metadata, quality fallback
app.get('/streaminfo/:info', async(req, res) => {
    let info = req.params.info;
    let quality = req.query.q ? req.query.q : 3;
    let qualityInfo = await deezer.fallback(info, quality);

    if (qualityInfo == null)
        return res.sendStatus(404).end();

    //Generate stream URL before sending
    qualityInfo.generateUrl();
    return res.json(qualityInfo);
});

// S T R E A M I N G
app.get('/stream/:info', async(req, res) => {
    //Parse stream info
    let quality = req.query.q ? req.query.q : 3;
    let streamInfo = Track.getUrlInfo(req.params.info);
    streamInfo.quality = quality;

    //MIME type of audio
    let mime = 'audio/mp3';
    if (quality == 9) mime = 'audio/flac';

    //Parse range header
    let range = 'bytes=0-';
    if (req.headers.range) range = req.headers.range;
    let rangeParts = range.replace(/bytes=/, '').split('-');
    let start = parseInt(rangeParts[0], 10);
    let end = -1;
    if (rangeParts.length >= 2) end = rangeParts[1];
    if (end == '' || end == ' ') end = -1;

    //Create Stream
    let stream = new DeezerStream(streamInfo, {});
    await stream.open(start, end);

    //Range header
    if (req.headers.range) {
        end = (end == -1) ? stream.size - 1 : end;
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stream.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': stream.size - start,
            'Content-Type': mime
        });

        //Normal (non range) request
    } else {
        res.writeHead(200, {
            'Content-Length': stream.size,
            'Content-Type': mime
        });
    }

    //Should force HTML5 to retry
    stream.on('error', () => {
        res.destroy();
    });

    stream.pipe(res);
});

//Get deezer page
app.get('/page', async(req, res) => {
    let target = req.query.target.replace(/'/g, '');

    let st = ['album', 'artist', 'artistLineUp', 'channel', 'livestream', 'flow', 'playlist', 'radio', 'show', 'smarttracklist', 'track', 'user', 'video-link', 'external-link'];
    let data = await deezer.callApi('page.get', {}, {
        'PAGE': target,
        'VERSION': '2.5',
        'SUPPORT': {
            'ads': [ /* 'native' */ ], //None
            'deeplink-list': ['deeplink'],
            'event-card': ['live-event'],
            'grid-preview-one': st,
            'grid-preview-two': st,
            'grid': st,
            'horizontal-grid': st,
            'horizontal-list': ['song'],
            'item-highlight': ['radio'],
            'large-card': ['album', 'external-link', 'playlist', 'show', 'video-link'],
            'list': ['episode'],
            'message': ['call_onboarding'],
            'mini-banner': ['external-link'],
            'slideshow': ['album', 'artist', 'channel', 'external-link', 'flow', 'livestream', 'playlist', 'show', 'smarttracklist', 'user', 'video-link'],
            'small-horizontal-grid': ['flow'],
            'long-card-horizontal-grid': st,
            'filterable-grid': ['flow']
        },
        'LANG': settings.contentLanguage,
        'OPTIONS': ['deeplink_newsandentertainment', 'deeplink_subscribeoffer']
    });

    // logger.warn("data", data.results)

    res.send(new DeezerPage(data.results));
});

//Get smart track list or flow tracks
app.get('/smarttracklist/:type?/:id', async(req, res) => {
    let id = req.params.id;
    let type = req.params.type ? req.params.type : undefined;

    //Flow not normal STL
    if (type == 'flow') {
        let data = await deezer.callApi('radio.getUserRadio', {
            config_id: id,
            user_id: deezer.userId
        });
        let tracks = data.results.data.map((t) => new Track(t));
        return res.send(tracks);
    }

    //Normal STL
    let data = await deezer.callApi('smartTracklist.getSongs', {
        smartTracklist_id: id
    });
    //No more tracks
    if (!data.results.data) {
        logger.warn('No more STL tracks: ' + JSON.stringify(data.error));
        return res.send([]);
    }

    let tracks = data.results.data.map((t) => new Track(t));
    return res.send(tracks);
});

//Artist smart radio
app.get('/smartradio/:id', async(req, res) => {
    let data = await deezer.callApi('smart.getSmartRadio', { art_id: req.params.id });
    res.send(data.results.data.map(t => new Track(t)));
});

//Track Mix
app.get('/trackmix/:id', async(req, res) => {
    let data = await deezer.callApi('song.getContextualTrackMix', { sng_ids: [req.params.id] });
    res.send(data.results.data.map(t => new Track(t)));
});

// Load lyrics by song ID
app.get('/lyrics/:id/:p', async(req, res) => {
    var provider;
    if (req.params.p == "Deezer") provider = "Deezer"
    if (req.params.p == "LRCLib") provider = "lrclib"
    if (req.params.p == "MusixMatch") provider = "mxm"
    if (req.params.p == "Genius") provider = "genius"
    try {
        if (provider == "Deezer") {
        // Create the GraphQL query string
        const queryStringGraphQL = `
            query SynchronizedTrackLyrics($trackId: String!) {
              track(trackId: $trackId) {
                id
                isExplicit
                lyrics {
                  id
                  copyright
                  text
                  writers
                  synchronizedLines {
                    lrcTimestamp
                    line
                    milliseconds
                    duration
                  }
                }
              }
            }
        `;

        // Create the request parameters
        const requestParams = {
            operationName: 'SynchronizedTrackLyrics',
            variables: { trackId: req.params.id },
            query: queryStringGraphQL,
        };

        // Call the Pipe API
        const pipeApiResponse = await deezer.callPipeApi(requestParams);

        // Check if Pipe API returned valid lyrics
        if (pipeApiResponse.data && pipeApiResponse.data.track.lyrics) {
            return res.json(pipeApiResponse.data);
        }

        // Fallback to the legacy API if no lyrics are found or there are errors
        const legacyApiResponse = await deezer.callApi('song.getLyrics', {
            sng_id: parseInt(req.params.id, 10),
        });

        if (legacyApiResponse.results) {
            return res.json(legacyApiResponse.results);
        }

        // No lyrics found in either API
        res.status(502).send('Lyrics not found!');

    } else { // provider is not deezer

        try {
            var trackData = await deezer.callApi('song.getData', { sng_id: req.params.id });
            var a = await deezer.s();
            var b = await deezer.l(provider, `${trackData.results.SNG_TITLE} ${trackData.results.ART_NAME}`, 1, a)
            var c = await deezer.con(b)
            return res.json(c);
        } catch (error) {logger.error(error); console.error(error);}

    }
    } catch (error) {
        logger.error(error);
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

//Search Suggestions
app.get('/suggestions/:query', async(req, res) => {
    let query = req.params.query;
    try {
        let data = await deezer.callApi('search_getSuggestedQueries', {
            QUERY: query
        });
        let out = data.results.SUGGESTION.map((s) => s.QUERY);
        res.json(out);
    } catch (e) {
        res.json([]);
    }
});

//Post list of tracks to download
app.post('/downloads', async(req, res) => {
    downloadManager.addBatch(req.body);

    res.status(200).send('OK');
});

//PUT to /download to start
app.put('/download', async(req, res) => {
    await downloadManager.start();
    res.status(200).send('OK');
});

//DELETE to /download to stop/pause
app.delete('/download', async(req, res) => {
    await downloadManager.stop();
    res.status(200).send('OK');
})

//Get all downloads
app.get('/downloads', async(req, res) => {
    res.json({
        downloading: downloadManager.downloading,
        queue: downloadManager.queue,
        threads: downloadManager.threads.map(t => t.download)
    });
});

//Delete single download
app.delete('/downloads/:index', async(req, res) => {
    let index = parseInt(req.params.index, 10);
    await downloadManager.delete(index);
    res.status(200).end();
});

//Log listen to deezer & lastfm
app.post('/log/:id/:s', async(req, res) => {
    //LastFM
    integrations.scrobbleLastFM(req.body.title, req.body.album.title, req.body.artists[0].name);

    //Deezer
    if (settings.logListen) {
        let a = await deezer.callApi('log.listen', {
            params: {
                timestamp: Math.floor(new Date() / 1000),
                ts_listen: Math.floor(new Date() / 1000),
                type: 1,
                stat: { seek: 0, pause: 0, sync: 0 },
                ctxt: { t: req.params.s, id: req.params.id },
                media: { id: req.body.id, type: 'song', format: 'MP3_128' }
            }
        });
        // logger.warn("log.listen: ", a)
    }
    res.status(200).end();
});

//Last.FM authorization callback
app.get('/lastfm', async(req, res) => {
    //Got token
    if (req.query.token) {
        let token = req.query.token;
        //Authorize
        let authinfo = await integrations.loginLastFM(token);
        if (authinfo) {
            settings.lastFM = authinfo;
            settings.save();
        }
        //Redirect to homepage
        return res.redirect('/');
    }

    //Get auth url
    res.json({
        url: integrations.lastfm.getAuthenticationUrl({ cb: `http://${req.socket.remoteAddress}:${settings.port}/lastfm` })
    }).end();
});

//Get URL from deezer.page.link
app.get('/fullurl', async(req, res) => {
    let url = req.query.url;
    let r = await axios.get(url, { validateStatus: null });
    res.json({ url: r.request.res.responseUrl });
});

//About page
app.get('/about', async(req, res) => {
    res.json({
        version: packageJson.version
    });
});

app.get('/updates', async(req, res) => {
    try {
        const url = `https://raw.githubusercontent.com/Sheathed/Saturn-PC/refs/heads/main/package.json`;
        let response = await axios.get(url);
        //New version
        if (compareVersions(response.data.version, packageJson.version) >= 1) {
            res.send(response.data);
            return;
        }
        if (process.env.NODE_ENV === 'canary') {
            res.status(404).end();
            return;
        }
        res.status(404).end();
        return;
    } catch (e) {
        res.status(500).end();
    }
});

//Background image
app.get('/background', async(req, res) => {
    //Missing
    if (!settings.backgroundImage && !fs.existsSync(settings.backgroundImage)) {
        return res.status(404).end();
    }
    res.sendFile(path.resolve(settings.backgroundImage));
});

//Redirect to index on unknown path
app.all('*', (req, res) => {
    res.redirect('/');
});

// S O C K E T S
io.on('connection', (socket) => {
    sockets.push(socket);
    //Remove on disconnect
    socket.on('disconnect', () => {
        sockets.splice(sockets.indexOf(socket), 1);
    });
    //Send to integrations
    socket.on('stateChange', (data) => {
        integrations.updateState(data);
    });
});

//ecb = Error callback
async function createServer(electron = false, ecb, override = {}) {
    //Prepare globals
    settings = new Settings(electron);
    settings.load();

    deezer = new DeezerAPI(settings.arl, electron);

    //Prepare downloads
    downloadManager = new DownloadManager(settings, () => {
        //Emit queue change to socket
        sockets.forEach((s) => {
            s.emit('downloads', {
                downloading: downloadManager.downloading,
                queue: downloadManager.queue,
                threads: downloadManager.threads.map(t => t.download)
            });
        });
    });
    await downloadManager.load();
    downloadManager.setDeezer(deezer);
    //Emit download progress updates
    setInterval(() => {
        sockets.forEach((s) => {
            if (!downloadManager.downloading && downloadManager.threads.length == 0)
                return;

            s.emit('currentlyDownloading', downloadManager.threads.map(t => t.download));
        });
    }, 400);

    //Integrations (lastfm, discord)
    integrations = new Integrations(settings);
    //Discord Join = Sync tracks
    integrations.on('discordJoin', async(data) => {
        let trackData = await deezer.callApi('deezer.pageTrack', { sng_id: data.id });
        let track = new Track(trackData.results.DATA);
        let out = {
                track: track,
                position: (Date.now() - data.ts) + data.pos
            }
            //Emit to sockets
        sockets.forEach((s) => {
            s.emit('playOffset', out);
        });
    });

    //Error callback
    server.on('error', (e) => {
        if (ecb)
            ecb(e);
        logger.error(e);
    });

    //Start server
    let serverIp = override.host ? override.host : settings.serverIp;
    let port = override.port ? override.port : settings.port;
    server.listen(port, serverIp);
    console.log(`Running on: http://${serverIp}:${port}`);

    return settings;
}

module.exports = { createServer };
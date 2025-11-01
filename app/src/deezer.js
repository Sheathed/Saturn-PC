const crypto = require('crypto');
const axios = require('axios');
const decryptor = require('nodeezcryptor');
const querystring = require('querystring');
const https = require('https');
const { Transform, Readable } = require('stream');
const { Track } = require('./definitions');
const logger = require('./winston');

global.lasturl;
global.resetTimer; // undefined on first cast which is fine tbh
global.token;

class DeezerAPI {

    constructor(arl, electron = false) {
        this.arl = arl;
        this.electron = electron;
        this.url = 'https://www.deezer.com/ajax/gw-light.php';
    }

    //Get headers
    headers() {
        let cookie = `arl=${this.arl}`;
        if (this.sid) cookie += `; sid=${this.sid}`;
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Content-Language": "en-US",
            "Cache-Control": "max-age=0",
            "Accept": "*/*",
            "Accept-Charset": "utf-8,ISO-8859-1;q=0.7,*;q=0.3",
            "Accept-Language": "en-US,en;q=0.9,en-US;q=0.8,en;q=0.7",
            "Connection": 'keep-alive',
            "Cookie": cookie
        }
    }

    // Method to get JSON Web Token
    async getJsonWebToken() {
        const url = 'https://auth.deezer.com/login/arl?jo=p&rto=c&i=c';

        // Prepare cookies
        const cookies = `arl=${this.arl}${this.sid ? '; sid=' + this.sid : ''}`;

        try {
            // Make POST request
            const response = await axios.post(url, {}, {
                headers: {
                    'Cookie': cookies
                }
            });

            // Return JWT if exists
            return response.data.jwt || '';
        } catch (error) {
            console.error('Error getting JSON Web Token:', error);
            throw new Error('Failed to retrieve JWT');
        }
    }

    // Wrapper because Electron is piece of shit
    async callPipeApi(body) {
        const jwtToken = await this.getJsonWebToken();
        if (this.electron) return await this._callPipeApiElectron(body, jwtToken);
        return await this._callPipeApiAxios(body, jwtToken);
    }

    async _callPipeApiElectron(body, jwtToken) {
        const net = require('electron').net;
        let data = await new Promise((resolve, reject) => {
            // Create request
            let req = net.request({
                method: 'POST', // Changed to POST
                url: `https://pipe.deezer.com/api/`,
                responseType: 'json',
                headers: {
                    ...this.headers(),
                    'Authorization': `Bearer ${jwtToken}`,
                    'Content-Type': 'application/json' // Set content type
                }
            });

            // Write the body to the request
            req.write(JSON.stringify(body));

            req.on('response', (res) => {
                let data = Buffer.alloc(0);
                // Response data
                res.on('data', (buffer) => {
                    data = Buffer.concat([data, buffer]);
                });
                res.on('end', () => {
                    resolve(data);
                });
            });
            req.on('error', (err) => {
                reject(err);
            });
            req.end();
        });

        data = JSON.parse(data.toString('utf-8'));
        return data;
    }

    async _callPipeApiAxios(body, jwtToken) {
        let res = await axios({
            url: `https://pipe.deezer.com/api/`,
            method: 'POST', // Changed to POST
            headers: {
                ...this.headers(),
                'Content-Type': 'application/json', // Set content type
                'Authorization': `Bearer ${jwtToken}`,
            },
            data: body // Use 'data' instead of 'body'
        });
        return res.data;
    }

    //Wrapper for api calls, because axios doesn't work reliably with electron
    async callApi(method, args = {}, gatewayInput = null) {
        if (this.electron) return await this._callApiElectronNet(method, args, gatewayInput);
        return await this._callApiAxios(method, args, gatewayInput);
    }

    //gw_light api call using axios, unstable in electron
    async _callApiAxios(method, args = {}, gatewayInput = null) {
        let data = await axios({
            url: this.url,
            method: 'POST',
            headers: this.headers(),
            responseType: 'json',
            params: Object.assign({
                    api_version: '1.0',
                    api_token: this.token ? this.token : 'null',
                    input: '3',
                    method: method,
                },
                gatewayInput ? { gateway_input: JSON.stringify(gatewayInput) } : null
            ),
            data: args
        });

        //Save SID cookie to not get token error
        if (method == 'deezer.getUserData') {
            global.token = data.data.results.USER.OPTIONS.license_token;
            global.resetTimer = Math.floor(new Date().getTime() / 1000);
            let sidCookie = data.headers['set-cookie'].filter((e) => e.startsWith('sid='));
            if (sidCookie.length > 0) {
                sidCookie = sidCookie[0].split(';')[0];
                this.sid = sidCookie.split('=')[1];
            }
        }

        //Invalid CSRF
        if (data.data.error && data.data.error.VALID_TOKEN_REQUIRED) {
            await this.authorize();
            return await this.callApi(method, args, gatewayInput);
        }

        return data.data;
    }

    //gw_light api call using electron net
    async _callApiElectronNet(method, args = {}, gatewayInput = null) {
        const net = require('electron').net;
        let data = await new Promise((resolve, reject) => {
            //Create request
            let req = net.request({
                method: 'POST',
                url: this.url + '?' + querystring.stringify(Object.assign({
                        api_version: '1.0',
                        api_token: this.token ? this.token : 'null',
                        input: '3',
                        method: method,
                    },
                    gatewayInput ? { gateway_input: JSON.stringify(gatewayInput) } : null
                )),
            });

            req.on('response', (res) => {
                let data = Buffer.alloc(0);

                //Save SID cookie
                if (method == 'deezer.getUserData') {
                    global.resetTimer = Math.floor(new Date().getTime() / 1000);
                    let sidCookie = res.headers['set-cookie'].filter((e) => e.startsWith('sid='));
                    if (sidCookie.length > 0) {
                        sidCookie = sidCookie[0].split(';')[0];
                        this.sid = sidCookie.split('=')[1];
                    }
                }

                //Response data
                res.on('data', (buffer) => {
                    data = Buffer.concat([data, buffer]);
                });
                res.on('end', () => {
                    resolve(data);
                })
            });
            req.on('error', (err) => {
                reject(err);
            });

            //Write headers
            let headers = this.headers();
            for (let key of Object.keys(headers)) {
                req.setHeader(key, headers[key]);
            }
            req.write(JSON.stringify(args));
            req.end();
        });

        data = JSON.parse(data.toString('utf-8'));

        //Invalid CSRF
        if (data.error && data.error.VALID_TOKEN_REQUIRED) {
            await this.authorize();
            return await this.callApi(method, args, gatewayInput);
        }

        if (method == 'deezer.getUserData') {
            global.token = data.results.USER.OPTIONS.license_token;
        }

        return data;
    }

    //true / false if success
    async authorize() {
        let data = await this.callApi('deezer.getUserData');

        this.plan = data.results.OFFER_NAME;

        this.token = data.results.checkForm;
        this.userId = data.results.USER.USER_ID;
        this.favoritesPlaylist = data.results.USER.LOVEDTRACKS_ID.toString();

        if (!this.userId || this.userId == 0 || !this.token || this.plan == "Deezer Free") return false;
        return true;
    }

    //Wrapper because electron is piece of shit
    async callPublicApi(path, params) {
        if (this.electron) return await this._callPublicApiElectron(path, params);
        return await this._callPublicApiAxios(path, params);
    }

    async _callPublicApiElectron(path, params) {
        const net = require('electron').net;
        let data = await new Promise((resolve, reject) => {
            //Create request
            let req = net.request({
                method: 'GET',
                url: `https://api.deezer.com/${encodeURIComponent(path)}/${encodeURIComponent(params)}`
            });

            req.on('response', (res) => {
                let data = Buffer.alloc(0);
                //Response data
                res.on('data', (buffer) => {
                    data = Buffer.concat([data, buffer]);
                });
                res.on('end', () => {
                    resolve(data);
                })
            });
            req.on('error', (err) => {
                reject(err);
            });
            req.end();
        });

        data = JSON.parse(data.toString('utf-8'));
        return data;
    }

    async _callPublicApiAxios(path, params) {
        let res = await axios({
            url: `https://api.deezer.com/${encodeURIComponent(path)}/${encodeURIComponent(params)}`,
            responseType: 'json',
            method: 'GET'
        });
        return res.data;
    }

    //Get track URL
    static getUrl(trackId, md5origin, mediaVersion, quality = 3) {
        const magic = Buffer.from([0xa4]);
        let step1 = Buffer.concat([
            Buffer.from(md5origin),
            magic,
            Buffer.from(quality.toString()),
            magic,
            Buffer.from(trackId),
            magic,
            Buffer.from(mediaVersion)
        ]);
        //MD5
        let md5sum = crypto.createHash('md5');
        md5sum.update(step1);
        let step1md5 = md5sum.digest('hex');

        let step2 = Buffer.concat([
            Buffer.from(step1md5),
            magic,
            step1,
            magic
        ]);
        //Padding
        while (step2.length % 16 > 0) {
            step2 = Buffer.concat([step2, Buffer.from('.')]);
        }

        const _0xa4b1 = ['am82YWV5NmhhaWQyVGVpaA==', 'base64', 'utf-8'];
        const _0x41e4 = function(_0x23d1, _0x16c2) {
            _0x23d1 = _0x23d1 - 0x0;
            return _0xa4b1[_0x23d1];
        };

        let _0x345a = Buffer.from(_0x41e4('0x0'), _0x41e4('0x1')).toString(_0x41e4('0x2'));

        //AES
        let aesCipher = crypto.createCipheriv('aes-128-ecb', _0x345a, Buffer.from(''));
        let step3 = Buffer.concat([aesCipher.update(step2, 'binary'), aesCipher.final()]).toString('hex').toLowerCase();

        global.lasturl = `https://e-cdns-proxy-${md5origin.substring(0, 1)}.dzcdn.net/mobile/1/${step3}`

        return `https://e-cdns-proxy-${md5origin.substring(0, 1)}.dzcdn.net/mobile/1/${step3}`;
    }


    // Updated URL gen from yours truly @ github.com/Ascensionist
    // both tokens are refreshed on call so i might change that later on to speed the process up
    async generateUrl(trackId, md5origin, mediaVersion, quality = 3) {

        // yucky gross token age check

        var l;

        if (!((Math.floor(new Date().getTime() / 1000) - global.resetTimer) >= 3600)) { // unix ts
            l = global.token; // deezer api provides the token expiry but like why use it lol
        } else {
            var userdata = await this.callApi('deezer.getUserData');
            var l = userdata.results.USER.OPTIONS.license_token
        }

        // TODO:
        // I am actually not entirely sure how to account for track token expiry
        // so I guess I'll look into it a bit more later on

        if (quality != 1 || true === true) {

            var trackData = await this.callApi('song.getData', { sng_id: trackId });

            var t = trackData.results.TRACK_TOKEN

            try {
                if (t.toString() != null && l.toString() != null) {

                    var qty;

                    //9 - FLAC
                    //3 - MP3 320
                    //1 - MP3 128

                    if (trackId.startsWith('-')) {
                        qty = "MP3_MISC"
                    } else {
                        if (quality == 3) {
                            qty = "MP3_320"
                        } else if (quality == 1) {
                            qty = "MP3_128"
                        } else if (quality == 9) {
                            qty = "FLAC"
                        }
                    }

                    let json = {
                        'license_token': l,
                        'media': [{
                            'type': 'FULL',
                            'formats': [{ 'cipher': 'BF_CBC_STRIPE', 'format': qty }]
                        }],
                        'track_tokens': [t]
                    }

                    try {

                        var res = await axios({
                            method: 'POST',
                            headers: this.headers(),
                            url: `https://media.deezer.com/v1/get_url`,
                            data: json,
                            responseType: 'json'
                        });

                    } catch (err) { "failed on request: " + err }

                    if (qty != 'FLAC') {
                        global.lasturl = res.data.data[0].media[0].sources[1].url
                        return {
                            encrypted: true,
                            url: res.data.data[0].media[0].sources[1].url
                        };
                    } else {
                        global.lasturl = res.data.data[0].media[0].sources[1].url
                        return {
                            encrypted: true,
                            url: res.data.data[0].media[0].sources[1].url
                        };
                    }


                } else { logger.warn("track token or license token are null") }
            } catch (e) {
                logger.warn('failed: ' + e);
            }
        } else {
            return {
                encrypted: true,
                url: DeezerAPI.getUrl(trackId, md5origin, mediaVersion, quality)
            };
        }
    }

    async s() {
        try {

            const crypto = require('crypto');

            const currentDate = new Date();
            const l = currentDate.getFullYear().toString();
            const s = (currentDate.getMonth() + 1).toString().padStart(2, '0');
            const r = currentDate.getDate().toString().padStart(2, '0');

            const message = Buffer.from(l + s + r);

            const key = Buffer.from(
              l + (currentDate.getMonth() + 1) + currentDate.getDate()
            );

            const hashOutput = crypto.createHmac('sha256', key).update(message).digest();

            const encodedHash = hashOutput.toString('base64');
            const a = encodedHash.replace(/[^A-Za-z0-9]+/g, '');
            
            return a;

        } catch (error) {
            logger.error(error)
            console.error(error)
        }
    }

    async l(a, b, c, d){

        var res = await axios({
            method: 'GET',
            headers: "",
            url: `https://lyrics.saturn.kim/${a}/${b}/${c}/${d}`,
            responseType: 'json'
        });

        var r = res.data;
        return r;
    }

    async con(inputJson) {
        const { lyrics } = inputJson;
        const synchronizedLines = await this.parseLyrics(lyrics);
        
        return {
            track: {
                id: "777", // Placeholder ID, can be dynamic
                isExplicit: false,
                lyrics: {
                    copyright: "Unknown", // Placeholder copyright info
                    id: "777", // Placeholder lyrics ID
                    synchronizedLines,
                    text: lyrics.replace(/\[\d+:\d+\.\d+\] /g, ""), // Remove timestamps
                    writers: "Unknown" // Placeholder writers info
                }
            }
        };
    }

    async parseLyrics(lyrics) {
        const lines = lyrics.split('\n');
        const synchronizedLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/\[(\d+):(\d+\.\d+)\] (.*)/);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseFloat(match[2]);
                const milliseconds = (minutes * 60 + seconds) * 1000;
                const line = match[3];
                
                let duration = 3000; // placeholder
                if (synchronizedLines.length > 0) {
                    duration = milliseconds - synchronizedLines[synchronizedLines.length - 1].milliseconds;
                }
                
                synchronizedLines.push({
                    line,
                    lrcTimestamp: match[0].substring(0, match[0].indexOf(']') + 1),
                    milliseconds,
                    duration
                });
            }
        }
        
        return synchronizedLines;
    }

    async fallback(info, quality = 3) {
        let qualityInfo = Track.getUrlInfo(info);

        //User uploaded MP3s
        // if (qualityInfo.trackId.startsWith('-')) {
        //     qualityInfo.quality = 3;
        //     return qualityInfo;
        // }

        //Quality fallback
        let newQuality = await this.qualityFallback(qualityInfo, quality);
        if (newQuality != null) {
            return qualityInfo;
        }
        //ID Fallback
        let trackData = await this.callApi('deezer.pageTrack', { sng_id: qualityInfo.trackId });
        try {
            if (trackData.results.DATA.FALLBACK.SNG_ID.toString() != qualityInfo.trackId) {
                let newId = trackData.results.DATA.FALLBACK.SNG_ID.toString();
                let newTrackData = await this.callApi('deezer.pageTrack', { sng_id: newId });
                let newTrack = new Track(newTrackData.results.DATA);
                return this.fallback(newTrack.streamUrl);
            }
        } catch (e) {
            logger.warn('TrackID Fallback failed: ' + e + ' Original ID: ' + qualityInfo.trackId);
        }
        //ISRC Fallback
        try {
            let publicTrack = this.callPublicApi('track', 'isrc:' + trackData.results.DATA.ISRC);
            let newId = publicTrack.id.toString();
            let newTrackData = await this.callApi('deezer.pageTrack', { sng_id: newId });
            let newTrack = new Track(newTrackData.results.DATA);
            return this.fallback(newTrack.streamUrl);
        } catch (e) {
            logger.warn('ISRC Fallback failed: ' + e + ' Original ID: ' + qualityInfo.trackId);
        }
        return null;
    }

    //Fallback thru available qualities, -1 if none work
    async qualityFallback(info, quality = 3) {
        try {
            let urlGen = await this.generateUrl(info.trackId, info.md5origin, info.mediaVersion, quality);
            let res = await axios.head(urlGen.url);
            if (res.status > 400) throw new Error(`Status code: ${res.status}`);
            //Make sure it's an int
            info.quality = parseInt(quality.toString(), 10);
            info.size = parseInt(res.headers['content-length'], 10);
            info.encrypted = urlGen.encrypted;
            if (!info.encrypted)
                info.direct = urlGen.url;
            return info;
        } catch (e) {
            logger.warn('Quality fallback: ' + e);
            //Fallback
            //9 - FLAC
            //3 - MP3 320
            //1 - MP3 128
            let nq = -1;
            if (quality == 3) nq = 1;
            if (quality == 9) nq = 3;
            if (quality == 1) return null;
            return this.qualityFallback(info, nq);
        }
    }

}

class DeezerStream extends Readable {
    constructor(qualityInfo, options) {
        super(options);
        this.qualityInfo = qualityInfo;
        this.ended = false;
    }

    async open(offset, end) {
        //Prepare decryptor
        this.decryptor = new DeezerDecryptionStream(this.qualityInfo.trackId, { offset });
        this.decryptor.on('end', () => {
            this.ended = true;
        });

        //Calculate headers
        let offsetBytes = offset - (offset % 2048);
        end = (end == -1) ? '' : end;
        let url = global.lasturl;

        //Open request
        await new Promise((res) => {
            this.request = https.get(url, { headers: { 'Range': `bytes=${offsetBytes}-${end}` } }, (r) => {
                r.pipe(this.decryptor);
                this.size = parseInt(r.headers['content-length'], 10) + offsetBytes;
                res();
            });
        });
    }

    async _read() {
        //Decryptor ended
        if (this.ended)
            return this.push(null);

        this.decryptor.once('readable', () => {
            this.push(this.decryptor.read());
        });
    }

    _destroy(err, callback) {
        this.request.destroy();
        this.decryptor.destroy();
        callback();
    }

}

class DeezerDecryptionStream extends Transform {

    constructor(trackId, options = { offset: 0 }) {
        super();
        //Offset as n chunks
        this.offset = Math.floor(options.offset / 2048);
        //How many bytes to drop
        this.drop = options.offset % 2048;
        this.buffer = Buffer.alloc(0);

        this.key = decryptor.getKey(trackId);
    }

    _transform(chunk, encoding, next) {
        //Restore leftovers
        chunk = Buffer.concat([this.buffer, chunk]);

        while (chunk.length >= 2048) {
            //Decrypt
            let slice = chunk.slice(0, 2048);
            if ((this.offset % 3) == 0) {
                slice = decryptor.decryptBuffer(this.key, slice);
            }
            this.offset++;

            //Cut bytes
            if (this.drop > 0) {
                slice = slice.slice(this.drop);
                this.drop = 0;
            }

            this.push(slice);

            //Replace original buffer
            chunk = chunk.slice(2048);
        }
        //Save leftovers
        this.buffer = chunk;

        next();
    }

    //Last chunk
    async _flush(cb) {
        //drop should be 0, so it shouldnt affect
        this.push(this.buffer.slice(this.drop));
        this.drop = 0;
        this.buffer = Buffer.alloc(0);
        cb();
    }
}


module.exports = { DeezerAPI, DeezerDecryptionStream, DeezerStream };
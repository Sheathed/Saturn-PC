const crypto = require('crypto');
const logger = require('./winston');
const axios = require('axios');

// winston wrapper in case i ever get rid of it
function _logDebug(...args) { // no debug logs cuz idc
  if (logger && typeof logger.info === 'function') return logger.info(...args);
  console.info(...args);
}
function _logInfo(...args) {
  if (logger && typeof logger.info === 'function') return logger.info(...args);
  console.info(...args);
}
function _logError(...args) {
  if (logger && typeof logger.error === 'function') return logger.error(...args);
  console.error(...args);
}

// not sure why i bothered but why not
class DeezerLoginException extends Error {
  constructor(type, message) {
    super(message ?? type);
    this.name = 'DeezerLoginException';
    this.type = type;
    this.deezerMessage = message;
  }

  toString() {
    if (this.deezerMessage == null) return `DeezerLoginException: ${this.type}`;
    return `DeezerLoginException: ${this.type}\nCaused by: ${this.deezerMessage}`;
  }
}

/**
 * name->value
 */
class CookieManager {
  constructor() {
    this.cookies = new Map();
  }

  reset() {
    this.cookies.clear();
  }

  updateCookie(res) {
    if (!res || !res.headers) return;
    const setCookieList = res.headers['set-cookie'] || [];
    for (const sc of setCookieList) {
      const firstPart = sc.split(';', 1)[0];
      const eqIndex = firstPart.indexOf('=');
      if (eqIndex > 0) {
        const name = firstPart.substring(0, eqIndex).trim();
        const value = firstPart.substring(eqIndex + 1).trim();
        this.cookies.set(name, value);
      }
    }
  }

  get cookieHeader() {
    if (this.cookies.size === 0) return {};
    const cookieString = Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    return { Cookie: cookieString };
  }

  // helper for logging
  snapshot() {
    return Array.from(this.cookies.entries()).reduce((acc, [k, v]) => {
      acc[k] = v.length > 40 ? `${v.slice(0, 16)}...${v.slice(-8)}` : v;
      return acc;
    }, {});
  }
}

/**
 * Env
 */
const Env = {
  deezerClientId: 'NDQ3NDYy',
  deezerClientSecret: 'YTgzYmY3ZjM4YWQyZjEzN2U0NDQ3MjdjZmMzNzc1Y2Y=',
};

class DeezerLogin {
  static defaultHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36',
    'X-User-IP': '1.1.1.1',
    'x-deezer-client-ip': '1.1.1.1',
    Accept: '*/*',
  };

  static cookieManager = new CookieManager();

  /**
   * returns ARL string or '' on failure
   */
  static async getArlByEmailAndPassword(email, password) {
    // _logInfo('== getArlByEmailAndPassword START ==');
    // _logDebug('Input email:', { email: email });

    // 1) reset cookies
    this.cookieManager.reset();
    // _logDebug('Cookie manager reset. Current cookies snapshot:', { c: this.cookieManager.snapshot() });

    // 2) getUserData request for initial cookies
    const initUrl =
      'https://www.deezer.com/ajax/gw-light.php?method=deezer.getUserData&input=3&api_version=1.0&api_token=null';
    // _logInfo('Requesting initial getUserData to obtain initial cookies', { url: initUrl });

    let initRes;
    try {
      initRes = await axios.get(initUrl, { headers: { ...this.defaultHeaders }, validateStatus: () => true });
      // _logDebug('Initial response status:', { s: initRes.status });
      // _logDebug('Initial response headers (set-cookie):', initRes.headers['set-cookie'] || []);
    } catch (err) {
      // _logError('Initial getUserData request failed with error:', err && err.toString ? err.toString() : err);
      initRes = null;
    }

    if (initRes) {
      this.cookieManager.updateCookie(initRes);
      // _logDebug('Cookies after initial request:', this.cookieManager.snapshot());
    } else {
      // _logDebug('No initial response available; cookies unchanged:', this.cookieManager.snapshot());
    }

    // 3) attempt to get access token (this updates cookies on success)
    let accessToken;
    try {
      accessToken = await this._getAccessToken(email, password);
      // _logInfo('Access token acquisition step finished.', { accessToken: accessToken ? 'RECEIVED' : 'NONE' });
    } catch (e) {
      // If _getAccessToken throws DeezerLoginException, let everybody know
      // _logError('Access token step threw an exception:', { err: e && e.toString ? e.toString() : e });
      throw e;
    }

    if (accessToken == null) {
      // _logInfo('Access token is null -> returning empty ARL string.');
      // _logInfo('== getArlByEmailAndPassword END ==');
      return '';
    }

    // 4) request ARL using cookie header
    const requestHeaders = { ...this.defaultHeaders, ...this.cookieManager.cookieHeader };
    // _logDebug('Request headers for ARL request:', {
    //   ...requestHeaders,
    //   Cookie: requestHeaders.Cookie ? (requestHeaders.Cookie.length > 200 ? `${requestHeaders.Cookie.slice(0, 200)}...` : requestHeaders.Cookie) : undefined,
    // });

    const arlUrl =
      'https://www.deezer.com/ajax/gw-light.php?method=user.getArl&input=3&api_version=1.0&api_token=null';
    // _logInfo('Requesting user.getArl', { url: arlUrl });

    let arlRes;
    try {
      arlRes = await axios.get(arlUrl, { headers: requestHeaders, validateStatus: () => true });
      // _logDebug('ARL response status:', arlRes.status);
      // _logDebug('ARL response headers (set-cookie):', arlRes.headers['set-cookie'] || []);
      // _logDebug('ARL response body snippet:', String(arlRes.data).slice(0, 2000));
    } catch (err) {
      // _logError('ARL request failed:', err && err.toString ? err.toString() : err);
      // no throw, return ''
      // _logInfo('== getArlByEmailAndPassword END ==');
      return '';
    }

    this.cookieManager.updateCookie(arlRes);
    // _logDebug('Cookies after ARL request:', this.cookieManager.snapshot());

    // parse ARL response
    try {
      const body = arlRes.data;
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const results = parsed['results'];
      // _logInfo('Parsed ARL results:', { results: results });
      // _logInfo('== getArlByEmailAndPassword END ==');
      return results;
    } catch (err) {
      // _logError('Failed to parse ARL JSON:', err && err.toString ? err.toString() : err, 'rawBody:', arlRes.data);
      // _logInfo('== getArlByEmailAndPassword END ==');
      return '';
    }
  }

  /**
   * Helper to get access token by email + password
   * I commented out the logging but feel free to uncomment it if you need more verbose output
   * Some of the values were truncated for prettier looking logs
   */
  static async _getAccessToken(email, password) {
    // _logInfo('== _getAccessToken START ==');
    // _logDebug('Input email:', { email: email });

    const clientId = Buffer.from(Env.deezerClientId, 'base64').toString('utf8');
    const clientSecret = Buffer.from(Env.deezerClientSecret, 'base64').toString('utf8');
    // _logDebug('Using clientId (truncated):', { c: clientId && clientId.length > 12 ? `${clientId.slice(0, 8)}...` : clientId });

    let requestheaders = { ...this.defaultHeaders, ...this.cookieManager.cookieHeader };
    requestheaders = { ...requestheaders, ...this.cookieManager.cookieHeader }; // tryna ensure this looks as close to the Dart counterpart as possible

    // _logDebug('Request headers before auth request (Cookie snapshot):', this.cookieManager.snapshot());

    const hashedPassword = md5Hex(password);
    const hashedParams = md5Hex(`${clientId}${email}${hashedPassword}${clientSecret}`);

    // Truncate hashed values for pretty logging
    // const truncatedHashedPassword = hashedPassword.length > 16 ? `${hashedPassword.slice(0, 8)}...${hashedPassword.slice(-8)}` : hashedPassword;
    // const truncatedHashedParams = hashedParams.length > 16 ? `${hashedParams.slice(0, 8)}...${hashedParams.slice(-8)}` : hashedParams;

    // _logDebug('Computed hashedPassword (truncated):', { tp: truncatedHashedPassword });
    // _logDebug('Computed hashedParams (truncated):', { tp: truncatedHashedParams });

    const url = `https://connect.deezer.com/oauth/user_auth.php?app_id=${clientId}&login=${email}&password=${hashedPassword}&hash=${hashedParams}`;

    // _logInfo('Auth URL (truncated):', { url: url.split('&hash=')[0] });

    let accessToken = null;

    await axios
      .get(url, { headers: requestheaders, validateStatus: () => true })
      .then((res) => {
        // _logDebug('_getAccessToken: response status:', { r: res.status });
        // _logDebug('_getAccessToken: response headers (set-cookie):', res.headers['set-cookie'] || []);
        // _logDebug('_getAccessToken: response body snippet:', { s: String(res.data).slice(0, 2000) });

        // Update cookies from response
        this.cookieManager.updateCookie(res);
        // _logDebug('Cookies after auth response:', this.cookieManager.snapshot());

        // parse res.data
        let responseJson;
        try {
          responseJson = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        } catch (parseErr) {
          // _logError('_getAccessToken: Failed to parse JSON from auth response:', parseErr && parseErr.toString ? parseErr.toString() : parseErr, 'rawBody:', res.data);
          accessToken = null;
          return;
        }

        // _logDebug('_getAccessToken: parsed auth response object keys:', Object.keys(responseJson || {}));

        if (Object.prototype.hasOwnProperty.call(responseJson, 'access_token')) {
          accessToken = responseJson['access_token'];
          // _logInfo('_getAccessToken: access_token FOUND (truncated):', String(accessToken).slice(0, 12) + '...');
        } else if (Object.prototype.hasOwnProperty.call(responseJson, 'error')) {
          // _logError('Deezer returned error object', { error: responseJson.error, status: res.status });
          // throw custom exception (very kewl)
          throw new DeezerLoginException(responseJson['error']['type'], responseJson['error']['message']);
        } else {
          // _logInfo('_getAccessToken: No access_token and no error field in Deezer response', { responseJson });
          accessToken = null;
        }
      })
      .catch((e) => {
        // very verbose axios/non-axios error logging
        const isAxios = e && e.isAxiosError;
        if (isAxios && e.response) {
          _logError('_getAccessToken: axios error response', {
            status: e.response.status,
            headers: e.response.headers,
            bodySnippet:
              e.response.data && (typeof e.response.data === 'string' ? e.response.data.slice(0, 2000) : JSON.stringify(e.response.data).slice(0, 2000)),
          });
        } else {
          _logError('_getAccessToken: Login Error (E) (non-axios) ', { err: e && e.toString ? e.toString() : e });
        }

        // rethrow DeezerLoginException
        if (e instanceof DeezerLoginException) {
          // _logInfo('== _getAccessToken END (exception thrown) ==');
          throw e;
        }

        accessToken = null;
      });

    // _logInfo('== _getAccessToken END ==', { accessToken: accessToken ? 'RECEIVED' : 'NONE' });
    return accessToken;
  }
}

/** Utility: MD5 hex digest of a string. */
function md5Hex(str) {
  return crypto.createHash('md5').update(String(str), 'utf8').digest('hex');
}

// export everything tho this is mostly self contained
module.exports = { DeezerLogin, DeezerLoginException, CookieManager, md5Hex, Env };

<template>
<div :class='{"enable-bgi": $root.settings.backgroundImage}'>
  <v-app v-esc='closePlayer'>

    <v-system-bar 
      :color='$root.settings.lgbtMode ? null : $root.settings.lightTheme ? "#f5f5f5" : "#121212"' 
      app 
      class='topbar' 
      :class='{"lgbt-header": $root.settings.lgbtMode}'
      v-if='$root.settings.electron && !$root.settings.nativeTopBar'
      height='28'>

      <v-spacer></v-spacer>
      <span style='position: absolute; left: 45%'>{{ appName }} <span v-if='version'>v{{version}}</span></span>
      <v-spacer></v-spacer>
      <v-icon class='topbarbutton mx-2' @click='minimize'>mdi-window-minimize</v-icon>
      <v-icon class='topbarbutton mx-2' @click='maximize'>mdi-window-maximize</v-icon>
      <v-icon @click='exitApp' class='topbarbutton mx-2'>mdi-close</v-icon>
    </v-system-bar>

    <!-- Fullscreen player overlay -->
    <v-overlay 
      :dark='!$root.settings.lightTheme' 
      :light='$root.settings.lightTheme' :value='showPlayer' 
      :opacity='$root.settings.backgroundImage ? 0.0 : 1.0' 
      z-index="100"
      :color='$root.settings.lightTheme ? "#ffffff" : "#212121"'>
      
      <img :src='backgroundSrc' class='wallpaper-overlay' v-if='$root.settings.backgroundImage'>
      <FullscreenPlayer @close='closePlayer' @volumeChange='volume = $root.volume'></FullscreenPlayer>
    </v-overlay>

    <!-- Drawer/Navigation -->
    <v-navigation-drawer 
      permanent
      fixed
      app
      :mini-variant="this.$root.settings.sidebarClosed || !this.$root.settings.sidebarOpen"
      :expand-on-hover="!this.$root.settings.sidebarClosed && !this.$root.settings.sidebarOpen"
    ><v-list nav dense>

        <!-- Profile -->
        <v-list-item two-line v-if='$root.profile && $root.profile.picture' class='miniVariant px-0'>
          <v-list-item-avatar>
            <img :src='$root.profile.picture.thumb'>
          </v-list-item-avatar>
          <v-list-item-content>
            <v-list-item-title>{{$root.profile.name}}</v-list-item-title>
            <v-list-item-subtitle>{{$root.profile.id}}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <!-- Home link -->
        <v-list-item link to='/home'>
          <v-list-item-icon>
            <v-icon>mdi-home</v-icon>
          </v-list-item-icon>
          <v-list-item-title>{{$t('Home')}}</v-list-item-title>
        </v-list-item>

        <!-- Browse link -->
        <v-list-item link to='/page?target=channels%2Fexplore'>
          <v-list-item-icon>
            <v-icon>mdi-earth</v-icon>
          </v-list-item-icon>
          <v-list-item-title>{{$t('Browse')}}</v-list-item-title>
        </v-list-item>

        <v-subheader inset>{{$t('Library')}}</v-subheader>
        <v-divider></v-divider>

        <!-- Tracks -->
        <v-list-item link to='/library/tracks'>
          <v-list-item-icon>
            <v-icon>mdi-music-note</v-icon>
          </v-list-item-icon>
          <v-list-item-title>{{$t('Tracks')}}</v-list-item-title>
        </v-list-item>

        <!-- Playlists -->
        <v-list-item link to='/library/playlists'>
          <v-list-item-icon>
            <v-icon>mdi-playlist-music</v-icon>
          </v-list-item-icon>
          <v-list-item-title>{{$t('Playlists')}}</v-list-item-title>
        </v-list-item>

        <!-- Albums -->
        <v-list-item link to='/library/albums'>
          <v-list-item-icon>
            <v-icon>mdi-album</v-icon>
          </v-list-item-icon>
          <v-list-item-title>{{$t('Albums')}}</v-list-item-title>
        </v-list-item>

        <!-- Artists -->
        <v-list-item link to='/library/artists'>
          <v-list-item-icon>
            <v-icon>mdi-account-music</v-icon>
          </v-list-item-icon>
          <v-list-item-title>{{$t('Artists')}}</v-list-item-title>
        </v-list-item>

        <v-subheader inset>{{$t('More')}}</v-subheader>
        <v-divider></v-divider>

        <!-- Settings -->
        <v-list-item link to='/settings'>
          <v-list-item-icon>
            <v-icon>mdi-cog</v-icon>
          </v-list-item-icon>
          <v-list-item-title>{{$t('Settings')}}</v-list-item-title>
        </v-list-item>

        <!-- Downloads, shitty hack if downloads not yet loaded -->
        <v-list-item link to='/downloads' v-if='$root.downloads.queue'>
          
          <!-- Download icon -->
          <v-list-item-icon v-if='!$root.downloads.downloading && $root.downloads.queue.length == 0'>
            <v-icon>mdi-download</v-icon>
          </v-list-item-icon>

          <!-- Paused download -->
          <v-list-item-icon v-if='!$root.downloads.downloading && $root.downloads.queue.length > 0'>
            <v-icon>mdi-pause</v-icon>
          </v-list-item-icon>

          <!-- Download in progress -->
          <v-list-item-icon v-if='$root.downloads.downloading'>
            <v-progress-circular :value='downloadPercentage' style='top: -2px' class='text-caption'>
              {{$root.downloads.queue.length + $root.downloads.threads.length}}
            </v-progress-circular>
          </v-list-item-icon>

          <v-list-item-title>{{$t('Downloads')}}</v-list-item-title>
        </v-list-item>

        <!-- About -->
        <v-list-item link to='/about'>
          <v-list-item-icon>
            <v-icon v-if='!updateAvailable'>mdi-information</v-icon>
            <v-icon color='primary' v-if='updateAvailable'>mdi-update</v-icon>
          </v-list-item-icon>
          <v-list-item-title>{{$t('About')}}</v-list-item-title>
        </v-list-item>

        <!-- Rooms -->
        <v-list-item link to='/rooms' v-if='btn === 200'>
          <v-list-item-icon>
            <v-icon>mdi-earth</v-icon>
          </v-list-item-icon>
          <v-list-item-title>Clubs</v-list-item-title>
        </v-list-item>

      </v-list>
    </v-navigation-drawer>

    <v-app-bar app dense :color='$root.settings.lightTheme ? null : "#1e1e1e"'>

      <v-btn icon @click='previous'>
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>

      <v-btn icon @click='next'>
        <v-icon>mdi-arrow-right</v-icon>
      </v-btn>

      <!-- Search -->
      <v-autocomplete
        hide-details
        prepend-inner-icon="mdi-magnify"
        flat
        single-line
        solo
        clearable
        hide-no-data
        :placeholder='$t("Search or paste Deezer URL. Use / to quickly focus.")'
        :loading='searchLoading'
        @keyup='search'
        ref='searchBar'
        :background-color='$root.settings.lightTheme ? "#ffffff00" : "#00000000"'
        v-model='searchQuery'
        :search-input.sync='searchInput'
        :items='suggestions'
      ></v-autocomplete>
      

    </v-app-bar>
    
    <!-- Main -->
    <img :src='backgroundSrc' class='wallpaper' v-if='$root.settings.backgroundImage'>
    <v-main>
      <v-container 
        class='overflow-y-auto'
        :class='{"main-container": $root.topBar, "main-container-notop": !$root.topBar}' 
        :fluid='fluidContainer'>
        <keep-alive include='Search,PlaylistPage,HomeScreen,DeezerPage'>
          <router-view></router-view>
        </keep-alive>
      </v-container>
    </v-main>
    
    <!-- Footer -->
    <v-footer fixed app height='70' class='pa-0'>

      <v-progress-linear 
        height='5' 
        :value='position'
        style='cursor: pointer;'
        class='seekbar'
        @change='seek'
        background-opacity='0'>
      </v-progress-linear>

      <v-row no-gutters align='center' ref='footer' class='ma-1'>

        <!-- No track loaded -->
        <v-col class='col-5 d-none d-sm-flex' v-if='!this.$root.track'>
          <h3 class='pl-4'>{{ appName }}</h3>
        </v-col>

        <!-- Track Info -->
        <v-col class='d-none d-sm-flex' cols='5' v-if='this.$root.track'>
            <v-img 
              :src='$root.track.albumArt.thumb'
              height="56"
              max-width="60"
              contain>
            </v-img>
            <div class='text-truncate flex-column d-flex'>
              <span class='text-subtitle-1 pl-2 text-no-wrap'>{{this.$root.track.title}}</span>
              <span class='text-subtitle-2 pl-2 text-no-wrap'>{{this.$root.track.artistString}}</span>
            </div>
        </v-col>

        <!-- Controls -->
        <v-col class='text-center' cols='12' sm='auto'>
          <div v-if='$rooms.allowControls()'>
            <v-btn icon large @click.stop='$root.skip(-1)'>
                <v-icon>mdi-skip-previous</v-icon>
            </v-btn>
            <v-btn icon x-large @click.stop='$root.toggle'>
                <v-icon v-if='!$root.isPlaying()'>mdi-play</v-icon>
                <v-icon v-if='$root.isPlaying()'>mdi-pause</v-icon>
            </v-btn>
            <v-btn icon large @click.stop='$root.skipNext'>
                <v-icon>mdi-skip-next</v-icon>
            </v-btn>
          </div>
        </v-col>


        <!-- Right side -->
        <v-spacer></v-spacer>

        <v-col cols='0' md='auto' class='d-none d-sm-none d-md-flex justify-center px-2' v-if='this.$root.track'>
          <span class='text-subtitle-2'>
            {{$duration($root.position)}} <span class='px-4'>{{qualityText}}</span>
          </span>
        </v-col>

        <v-spacer></v-spacer>
        
        <!-- Volume -->
        <v-col cols='auto' class='d-none d-sm-flex px-2' @click.stop ref='volumeBar'>
          <div style='width: 180px;' class='d-flex'>
            <v-slider 
              dense 
              hide-details 
              min='0.00' 
              max='1.00' 
              step='0.01' 
              v-model='volume' 
              :prepend-icon='$root.muted ? "mdi-volume-off" : "mdi-volume-high"'
              @click:prepend='$root.toggleMute()'
            >
              <template v-slot:append>
                  <div style='padding-top: 4px;'>
                      {{Math.round(volume * 100)}}%
                  </div>
              </template>
            </v-slider>
          </div>
            
        </v-col>

      </v-row>
    </v-footer>

    <!-- Global snackbar -->
    <v-snackbar timeout='2000' v-model='globalSnackbar'>
      {{this.$root.globalSnackbar}}
      <template v-slot:action='{attrs}'>
        <v-btn text v-bind="attrs" @click='globalSnackbar = false' color='primary'>
          {{$t("Dismiss")}}
        </v-btn>
      </template>
    </v-snackbar>

  </v-app>
</div>
</template>

<style lang='scss'>
@import 'styles/scrollbar.scss';
.v-navigation-drawer__content {
  overflow-y: hidden !important;
}
.enable-bgi {
  @import 'styles/bg-image.scss';
}

</style>
<style lang='scss' scoped>
.seekbar {
  transition: none !important;
}
.seekbar .v-progress-linear__determinate {
  transition: none !important;
}
.topbar {
  -webkit-app-region: drag;
  z-index: 6969;
}
.topbarbutton {
  -webkit-app-region: no-drag;
}
.wallpaper {
  width: 100vw;
  height: 100vh;
  z-index: -100;
  position: absolute;
  object-fit: fill;
}
.wallpaper-overlay {
  width: 100vw;
  height: 100vh;
  z-index: -100;
  position: absolute;
  object-fit: fill;
}

.main-container {
  height: calc(100vh - 140px);
}

.main-container-notop {
  height: calc(100vh - 118px);
}

.lgbt-header button {
  color: #000 !important;
}

</style>

<script>
import FullscreenPlayer from '@/views/FullscreenPlayer.vue';

export default {
  name: 'App',
  components: {
    FullscreenPlayer
  },
  data () {
    return {
      volume: this.$root.volume,
      showPlayer: false,
      position: '0.00',
      searchQuery: '',
      searchLoading: false,
      searchInput: null,
      suggestions: [],
      preventDoubleEnter: false,
      cancelSuggestions: false,
      globalSnackbar: false,
      version: null,
      btn: false,
      updateAvailable: false,
      fluidContainer: window.innerWidth < 1300
    }
  },
  methods: {
    //Hide fullscreen player overlay
    closePlayer() {
      if (this.showPlayer) this.showPlayer = false;
      this.volume = this.$root.volume;
    },
    //Navigation
    previous() {
      if (window.history.length == 3) return;
      this.$router.go(-1);
    },
    next() {
      this.$router.go(1);
    },
    async search(event) {
      //KeyUp event, enter
      if (event && event.keyCode !== 13) return;
      //Prevent double navigation
      if (this.preventDoubleEnter) return;
      this.preventDoubleEnter = true;
      setInterval(() => {this.preventDoubleEnter = false}, 50);

      //Check if url
      let query = this.searchInput;
      if (query.startsWith('http')) {
        this.searchLoading = true;
        let url = new URL(query);

        //Normal link
        if (url.hostname == 'www.deezer.com' || url.hostname == 'deezer.com' || url.hostname == 'dzr.page.link') {

          //Share link
          if (url.hostname == 'dzr.page.link') {
            let res = await this.$axios.get('/fullurl?url=' + encodeURIComponent(query));
            url = new URL(res.data.url);
          }

          let supported = ['track', 'artist', 'album', 'playlist'];

          let path = url.pathname.substring(1).split('/');
          if (path.length == 3) path = path.slice(1);
          let type = path[0];
          if (supported.includes(type)) {

            //Dirty lol
            let res = await this.$axios('/' + path.join('/'));
            if (res.data) {
              //Add to queue
              if (type == 'track') {
                this.$root.queue.data.splice(this.$root.queue.index + 1, 0, res.data);
                this.$root.skip(1);
              }
              //Show details page
              if (type == 'artist' || type == 'album' || type == 'playlist') {
                let query = {};
                query[type] = JSON.stringify(res.data);
                this.$router.push({path: `/${type}`, query: query});
              }
            }
          }
        }
        
        this.searchLoading = false;
      } else {
        //Normal search
        this.cancelSuggestions = true;
        this.suggestions = [];
        this.$router.push({path: '/search', query: {q: query}});
      }
    },
    seek(val) {
      if (!this.$rooms.allowControls()) return;
      this.$root.seek(Math.round((val / 100) * this.$root.duration()));
    },
    async exitApp() {
      await this.$root.saveSettings();
      await this.$root.savePlaybackInfo();
      const {ipcRenderer} = window.require('electron');
      ipcRenderer.send('close');
    },
    minimize() {
      const {ipcRenderer} = window.require('electron');
      ipcRenderer.send('minimize');
    },
    maximize() {
      const {ipcRenderer} = window.require('electron');
      ipcRenderer.send('maximize');
    },
    async checkUpdate() {
      try {
        let res = await this.$axios('/updates');
        if (res.data) 
          this.updateAvailable = true;
      } catch (_) {
        this.updateAvailable = false;
      } 
    }
  },
  computed: {
    appName () {
      if (process.env.NODE_ENV == 'canary') return 'Saturn Canary';
      return 'Saturn';
    },
    qualityText() {
      return `${this.$root.playbackInfo.qualityString}`;
    },
    downloadPercentage() {
      if (!this.$root.downloads.downloading) return 0;

      let downloaded = this.$root.downloads.threads.reduce((a, b) => a + b.downloaded, 0);
      let size = this.$root.downloads.threads.reduce((a, b) => a + b.size, 0);
      if (size == 0)
        size = 1;

      let p = (downloaded / size) * 100;
      if (p > 100)
        p = 100;
      return Math.round(p);
    },
    //Get background src
    backgroundSrc() {
      if (this.$root.settings.backgroundImage && this.$root.settings.backgroundImage.startsWith("http"))
        return this.$root.settings.backgroundImage;
      return process.env.NODE_ENV === 'development' ? "http://localhost:10069/background" : "/background";
    },
  },
  async mounted() {
    //Scroll on volume
    this.$refs.volumeBar.addEventListener('wheel', e => {
      //Volup
      if (e.deltaY < 0) {
        if (this.volume + 0.05 > 1)
          this.volume = 1;
        else 
          this.volume += 0.05;
      } else {
        //Voldown
        if (this.volume - 0.05 < 0)
          this.volume = 0;
        else 
          this.volume -= 0.05;
      }
    });

    //onClick for footer
    this.$refs.footer.addEventListener('click', () => {
      if (this.$root.track) this.showPlayer = true;
    });

    // /search
    document.addEventListener('keypress', (e) => {
      if (e.key != '/' || e.target.nodeName == "INPUT") return;
      this.$refs.searchBar.focus();
      setTimeout(() => {
        if (this.searchQuery.startsWith('/')) this.searchQuery = this.searchQuery.substring(1);
      }, 40);
    });

    //Wait for volume to load
    if (this.$root.loadingPromise) await this.$root.loadingPromise;
    this.volume = this.$root.volume;

    //Limit content width on large displays
    window.addEventListener('resize', () => {
      this.fluidContainer = window.innerWidth < 1300;
    });

    //Check for update
    this.checkUpdate();
  },
  async created() {
    //Go to login if unauthorized
    if (!this.$root.authorized) {
      this.$router.push('/login');
    }

    this.$axios.get('https://clubs.saturn.kim/rooms').then((res) => {
      this.btn = res.status;
    });

    this.$axios.get('/about').then((res) => {
      this.version = res.data.version;
    });
  },
  watch: {
    volume() {
      this.$root.volume = this.volume;
    },
    '$root.volume'() {
      this.volume = this.$root.volume;
    },
    //Update position
    '$root.position'() {
      this.position = (this.$root.position / this.$root.duration()) * 100;
    },
    //Global snackbar
    '$root.globalSnackbar'() {
      if (!this.$root.globalSnackbar) return;
      this.globalSnackbar = true;
      setTimeout(() => {
        this.$root.globalSnackbar = null;
      }, 2000);
    },
    //Autofill
    searchInput(query) {
      //Filters
      if (query && query.startsWith('/')) {
        query = query.substring(1);
        this.searchInput = query;
      }
      if (!query || (query && query.startsWith('http'))) {
        this.searchLoading = false;
        this.suggestions = [];
        return;
      }
      
      if (!this.$root.settings.showAutocomplete) return;
      this.searchLoading = true;
      //Prevent spam
      setTimeout(() => {
        if (query != this.searchInput) return;
        this.$axios.get('/suggestions/' + encodeURIComponent(query)).then((res) => {
          if (query != this.searchInput) return;
          //Cancel suggestions to prevent autocompletion when already searched
          if (this.cancelSuggestions) {
            this.cancelSuggestions = false;
            this.searchLoading = false;
            return;
          }
          this.suggestions = res.data;
          this.searchLoading = false;
        });
      }, 300); 
    },
    searchQuery(q) {
      this.searchInput = q;
      this.search(null);
    }
  }
};

</script>
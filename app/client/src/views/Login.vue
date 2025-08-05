<template>
    <v-overlay opacity='1.0' z-index='666'>
    
        <!-- Fullscreen loader -->
        <div v-if='authorizing && !error'>
            <v-progress-circular indeterminate>
            </v-progress-circular>
        </div>
    
        <!-- Error -->
        <v-card class='text-center pa-4' v-if='error'>
            <h1 class='text--red'>{{$t("Error logging in!")}}</h1>
            <h3>{{$t("Please try again later, or try another account.")}}</h3>
            <v-btn large class='my-4' @click='logout'>
                <v-icon left>mdi-logout-variant</v-icon>
                {{$t("Logout")}}
            </v-btn>
        </v-card>
    
        <!-- Login form -->
        <div v-if='showForm' class='text-center'>
            <v-img src='banner.png' contain max-width='400px' class='py-8'></v-img>
    
            <h3>{{$t("Please login using your Deezer account:")}}</h3>
            <v-btn large class='my-2 mb-4 primary' @click='browserLogin'>
                <v-icon left>mdi-open-in-app</v-icon>
                {{$t("Login using browser")}}
            </v-btn>
    
            <h3 class='mt-4'>{{$t("...or paste your ARL/Token below:")}}</h3>
            <v-text-field :label='$t("ARL/Token")' v-model='arl'>
            </v-text-field>
    
            <v-btn large class='my-4 primary' :loading='authorizing' @click='login'>
                <v-icon left>mdi-login-variant</v-icon>
                {{$t("Login")}}
            </v-btn>
    
            <br>
            <span class='mt-8 text-caption'>
                {{$t("2k25 saturn.kim")}}
            </span>
        </div>
    
    
    </v-overlay>
    </template>
    
    <script>
    export default {
        name: 'Login',
        data() {
            return {
                error: false,
                arl: '',
                showForm: false,
                authorizing: false
            }
        },
        methods: {
            async login() {
                this.showForm = false;
                this.authorizing = true;
    
                if (this.arl && this.arl != '') {
                    //Save arl
                    this.$root.settings.arl = this.arl;
                }
    
                //Authorize
                try {
                    await this.$axios.post('/authorize', {arl: this.$root.settings.arl});
                    this.$root.authorized = true;
                    
                } catch (e) {
                    this.error = true;
                }
    
                //Get profile on sucess
                if (this.$root.authorized) {
                    //Save
                    await this.$root.saveSettings();
    
                    //Load profile
                    let res = await this.$axios.get('/profile');
                    this.$root.profile = res.data;
    
                    //Auth rooms
                    this.$rooms.setProfile(this.$root.profile);
    
                    this.$router.push('/home');
                    //Cache library
                    this.$root.cacheLibrary();
                }
                
                this.authorizing = false;
            },
            //Log out, show login form
            logout() {
                this.error = false;
                this.arl = '';
                this.$root.settings.arl = '';
                this.showForm = true;
            },
            //Login using browser
            browserLogin() {
                if (!this.$root.settings.electron) return alert(this.$t('Only in Electron version!'));
    
                const {ipcRenderer} = window.require('electron');
                ipcRenderer.on('browserLogin', (event, newArl) => {
                    this.arl = newArl;
                    this.login();
                });
                ipcRenderer.send('browserLogin');
            }
        },
        async mounted() {
            //Wait for settings to load
            if (this.$root.loadingPromise) {
                this.authorizing = true;
                await this.$root.loadingPromise;
                this.authorizing = false;
            }
            this.showForm = true;
            
            if (this.$root.settings.arl) {
                this.login();
            }
        }
    };
    </script>
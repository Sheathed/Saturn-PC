<template>
<div>

    <v-img :src='banner' max-width='400px' class='mx-auto'></v-img>
    <div v-if='data' class='text-center text-h5 font-weight-bold'>
        v{{data.version}}
    </div>
    <br>
    <div v-if='update' class='text-center text-h6 font-weight-bold mb-4' @click='openUrl("https://nightly.link/Sheathed/Saturn-PC/workflows/main/main?preview")'>
        {{$t("New update available:")}} {{update.version}}
        <v-btn text color='primary' outlined class='mx-2'>{{$t("Visit website")}}</v-btn>
    </div>

    <h1 class='my-2 px-2'>{{$t("Links:")}}</h1>
    <v-list>
        <v-list-item @click='openUrl("https://saturn.kim")'>
            <v-list-item-icon>
                <v-icon>mdi-earth</v-icon>
            </v-list-item-icon>
            <v-list-item-content>
                <v-list-item-title class='font-weight-bold'>{{$t("Website")}}</v-list-item-title>
            </v-list-item-content>
        </v-list-item>
        <v-list-item @click='openUrl("https://t.me/SaturnReleases")'>
            <v-list-item-icon>
                <v-icon>mdi-telegram</v-icon>
            </v-list-item-icon>
            <v-list-item-content>
                <v-list-item-title class='font-weight-bold'>{{$t("Telegram Group")}}</v-list-item-title>
            </v-list-item-content>
        </v-list-item>
        <v-list-item @click='openUrl("https://discord.com/invite/fttYFSHPCQ")'>
            <v-list-item-icon>
                <v-icon>mdi-discord</v-icon>
            </v-list-item-icon>
            <v-list-item-content>
                <v-list-item-title class='font-weight-bold'>{{$t("Discord")}}</v-list-item-title>
            </v-list-item-content>
        </v-list-item>
        <v-list-item @click='openUrl("https://fund.saturn.kim/")'>
            <v-list-item-icon>
                <v-icon>mdi-currency-btc</v-icon>
            </v-list-item-icon>
            <v-list-item-content>
                <v-list-item-title class='font-weight-bold'>{{$t("Donate")}}</v-list-item-title>
            </v-list-item-content>
        </v-list-item>
    </v-list>

    <h1 class='my-2 px-2'>{{$t("Credits:")}}</h1>
    <v-list>
        <v-list-item @click='mattDialog = true'>
            <v-list-item-content>
                <v-list-item-title class='font-weight-bold'>Matt</v-list-item-title>
                <v-list-item-subtitle>Developer</v-list-item-subtitle>
            </v-list-item-content>
        </v-list-item>
        <v-list-item @click='bw86Dialog = true'>
            <v-list-item-content>
                <v-list-item-title class='font-weight-bold'>bw86</v-list-item-title>
                <v-list-item-subtitle>Logo Designer, Developer</v-list-item-subtitle>
            </v-list-item-content>
        </v-list-item>
        <v-list-item>
            <v-list-item-content>
                <v-list-item-title class='font-weight-bold'>exttex, Xandar Null, Francesco, Tobs</v-list-item-title>
                <v-list-item-subtitle>Original Freezer App</v-list-item-subtitle>
            </v-list-item-content>
        </v-list-item>
    </v-list>

    <div class='text-center text-h5 font-weight-bold my-4'>
        Translations provided by Crowdin supporters of the original Freezer app
    </div>

    <v-dialog v-model='bw86Dialog' max-width='512'>
        <v-card elevation='2'>
            <v-card-title class="headline">
                Visit my site!
            </v-card-title>
            <v-card-text>
                github.com/bw8686
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn color="red darken-1" text @click="bw86Dialog = false">
                    {{$t("Agree")}}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

    <v-dialog v-model='mattDialog' max-width='512'>
        <v-card elevation='2'>
            <v-card-title class="headline">
                hiya!! please star the repo
            </v-card-title>
            <v-card-text>
                github.com/Sheathed
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn color="red darken-1" text @click="mattDialog = false">
                    {{$t("Agree")}}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>


</div>
</template>

<script>
export default {
    name: 'About',
    data() {
        return {
            data: null,
            mattDialog: false,
            bw86Dialog: false,
            update: null
        }
    },
    methods: {
        openUrl(url) {
            if (this.$root.settings.electron) {
                const {ipcRenderer} = window.require('electron');
                ipcRenderer.send('openUrl', url);
                return;
            }
            window.open(url, '_blank');
        },
    },
    created() {
        this.$axios.get('/about').then((res) => {
            this.data = res.data;
        });
    },
    async mounted() {
        //Check for updates
        try {
            let res = await this.$axios.get('{{updateUrl}}');
            if (res.data) {
                this.update = res.data;
            }
        } catch (_) {
            //No update / failed to check, ignore
        }
    },
    computed: {
        banner() {
            if (process.env.NODE_ENV == 'canary') return 'banner-canary.png';
            return 'banner.png';
        }
    }
}
</script>

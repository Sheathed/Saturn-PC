[![Node.js CI](https://github.com/Sheathed/Saturn-PC/actions/workflows/main.yml/badge.svg)](https://github.com/Sheathed/Saturn-PC/actions/workflows/main.yml)
<sup> | [download](https://nightly.link/Sheathed/Saturn-PC/workflows/main/main?preview) </sup>

# Saturn
## Freezer Reborn
### Your go-to **ToS Compliant** Custom Deezer Client
### ⚠️ A premium account is required in order to use this client

### Donations
https://fund.saturn.kim/

# Featuring:
- FLAC & MP3 320 support
- BYO Last.fm Integration (Safer solution!)
- Discord Listen Together & RPC
- Fixed homepage
- Minor updates to make things work with newer API
- Redundant importer removed
- (aaand don't forget everything the older app had)

### You can download Saturn right away although it is highly advised to build it yourself, customized to your own liking.

## Running with Docker

From the project root, run:
```sh
docker compose up --build
```
This will both build & start Saturn on port 10069
##### It is advised for you to rename the .env.example file in /app to .env and uncomment the line in compose.yml if you want to be logged in automatically.

## Building

Requirements: NodeJS 17+  

You can build binary using npm script:
```sh
npm i 
npm run build
```

Or manually:

```sh
npm i
cd app
npm i 
```

Frontend:

```sh
cd client
npm i 
npm run build
cd ../..
```

Then you can run server-only using, default port: `10069`: 

```sh
cd app
node main.js
```

You can build binaries using:

```sh
npm run dist
```

# Links
- discord: https://discord.com/invite/fttYFSHPCQ
- telegram: https://t.me/SaturnReleases

# Mobile Version
https://github.com/Sheathed/Saturn-Mobile

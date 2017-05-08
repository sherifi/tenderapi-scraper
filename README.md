# Opentender Portal - Digiwhist Tender API Scraper

Collects the data from the Digiwhist Tender REST API and saves them into import packages

written in Javascript for NodeJS 6.x

## Installation

- install [NodeJS](https://nodejs.org/) 6.x and [NPM](https://www.npmjs.com/)

- run command `npm install` in the root folder of this repository

- prepare the data folder (see https://github.com/digiwhist/opentender-data)

- copy file 'config.dist.js' to 'config.js' and make the changes to reflect your infrastructure

```javascript
let settings = {
	tenderapi: {  // where the tender api is located
		host: 'x.x.x.x',
		port: 4000
	},
	data: { // absolute paths to the data folders (see digiwhist/data-folder)
		tenderapi: '/var/www/opentender/data/tenderapi'
	},
	api: { // url parts http://x.x.x.x:4000/master_tender/timestamp/2016-07-01T12:30:00.000/source/eu.digiwhist.worker.eu.master.TedTenderMaster/page/0
		main: 'master_tender',
		sub: '/source/eu.digiwhist.worker.eu.master.TedTenderMaster'
	}
};
```

## Commands

### Start

`npm run scrape` to run the scraper


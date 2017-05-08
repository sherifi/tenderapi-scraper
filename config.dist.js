let settings = {
	tenderapi: {  // where the tender api is located
		host: 'x.x.x.x',
		port: 4000
	},
	data: { // absolute paths to the data folders (see https://github.com/digiwhist/opentender-data)
		tenderapi: '/var/www/opentender/data/tenderapi'
	},
	api: { // url parts http://x.x.x.x:4000/master_tender/timestamp/2016-07-01T12:30:00.000/source/eu.digiwhist.worker.eu.master.TedTenderMaster/page/0
		main: 'master_tender',
		sub: '/source/eu.digiwhist.worker.eu.master.TedTenderMaster'
	}
};

module.exports = settings;
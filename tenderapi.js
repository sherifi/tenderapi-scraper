#!/usr/bin/env node

/*

 Collects the data from the Tender REST API and saves them into compressed import packages

 */

const path = require('path');
const request = require('request');
const fs = require('fs');
const winston = require('winston');

const lzma = require('lzma-native');


const logger = new (winston.Logger)({
	transports: [
		new (winston.transports.Console)({
			colorize: true,
			level: 'verbose',
			timestamp: true
		}),
		new winston.transports.File({filename: 'tenderapi.log', timestamp: true})
	],
	levels: {
		error: 0,
		warn: 1,
		data: 2,
		info: 3,
		verbose: 4,
		debug: 5,
		silly: 6
	},
	colors: {
		silly: 'magenta',
		verbose: 'cyan',
		info: 'green',
		data: 'grey',
		warn: 'yellow',
		debug: 'blue',
		error: 'red'
	}
});

const config = require('./config.js');

let timestamp2filename = (timestamp) => {
	return timestamp.replace(/[\/:\.]/g, '-');
};

let lpad = function (val) {
	let result = val.toString();
	while (result.length < 4) {
		result = '0' + result;
	}
	return result;
};

let ensureThreeMilliseconds = function (val) {
	let a = val.split(':');
	let s = a[a.length - 1];
	a = s.split('.');
	if (a.length === 1) {
		return val + '.000';
	}
	s = a[a.length - 1];
	while (s.length < 3) {
		s = s + '0';
		val = val + '0';
	}
	return val;
};

let getNextTimeStamp = function (body, cb) {
	let tenders = JSON.parse(body);
	let times = tenders.map(tender => ensureThreeMilliseconds(tender.modified)).sort((a, b) => {
		if (a < b) return -1;
		if (a > b) return 1;
		return 0;
	});
	if (times.length > 0) {
		cb(null, times[times.length - 1]);
	} else {
		cb(null, null);
	}
};

let scrape = (pack, cb) => {
	let running = 0;
	let done = false;
	let measure = {
		sum: 0,
		count: 0
	};

	let compress = function (filename, timestamp, page) {
		running++;
		let error;
		let encoder = lzma.createStream('easyEncoder', {preset: 9});
		let outstream = fs.createWriteStream(path.join(config.data.tenderapi, 'import', filename + '.xz'));
		outstream.on('finish', function () {
			if (!error) {
				fs.unlink(path.join(config.data.tenderapi, 'import', filename), () => {
				});
				pack.files.push(filename + '.xz');
				logger.info('Data saved compressed', filename + '.xz');
			} else {
				pack.errors.push(filename);
			}
			pack.timestamp = timestamp;
			pack.page = page;
			fs.writeFileSync(path.join(config.data.tenderapi, 'package_continue.json'), JSON.stringify(pack, null, '\t'));
			running--;
			if (done && running === 0) cb();
		});
		outstream.on('open', function () {
			fs.createReadStream(path.join(config.data.tenderapi, 'import', filename)).pipe(encoder).pipe(outstream);
		});
		outstream.on('error', function (err) {
			error = err;
		});
	};

	let get = function (timestamp, page, retry, next) {
		let filename = 'tenderapi_' + lpad(page) + '_' + timestamp2filename(timestamp) + '.json';
		let filestream = fs.createWriteStream(path.join(config.data.tenderapi, 'import', filename));
		let url = 'http://' + config.tenderapi.host + ':' + config.tenderapi.port + '/' + config.api.main + '/timestamp/' + timestamp + (config.api.sub ? config.api.sub : '') + '/page/0';
		logger.info('Data requesting', timestamp, '(' + lpad(page) + ')', url);
		let time = (new Date().valueOf());
		request.get(url, (error, response, body) => {
				if (!error && response && response.statusCode === 200) {
					let now = (new Date().valueOf());
					let ms = now - time;
					measure.count++;
					measure.sum += ms;
					logger.info('Data received', Math.round(ms / 1000) + 's' + ' (avg ' + Math.round((measure.sum / measure.count) / 1000) + 's)');
					compress(filename, timestamp, page);
					if (body.length < 3) {
						next();
					} else {
						getNextTimeStamp(body, (err, next_timestamp) => {
							if (next_timestamp !== null) {
								process.nextTick(() => {
									get(next_timestamp, page + 1, 0, cb);
								});
							} else {
								cb();
							}
						});
					}
				} else {
					if (response)
						logger.error('Error:' + response.statusCode + response.body);
					if (error)
						logger.error(error);
					if (retry < 10) {
						logger.info('Waiting for retry ' + (retry + 1));
						setTimeout(function () {
							get(timestamp, page, retry + 1, cb);
						}, 5000);
					} else {
						next(error || (response && response.statusCode))
					}
				}
			}
		)
		.pipe(filestream)
	};

	get(pack.timestamp, pack.page, 0, function (err) {
		if (err) return cb(err);
		done = true;
		if (running === 0) cb();
	});
};

let start = () => {

	let pack = {
		timestamp: '2015-01-01T00:00:00.000',
		page: 0,
		files: [],
		errors: []
	};

	if (fs.existsSync(path.join(config.data.tenderapi, 'package_continue.json'))) {
		logger.info('Found: continue-package');
		pack = JSON.parse(fs.readFileSync(path.join(config.data.tenderapi, 'package_continue.json')).toString());
	} else if (fs.existsSync(path.join(config.data.tenderapi, 'package_next.json'))) {
		logger.info('Found: next-package');
		let nextpackage = JSON.parse(fs.readFileSync(path.join(config.data.tenderapi, 'package_next.json')).toString());
		pack.timestamp = nextpackage.timestamp;
	} else {
		logger.info('No package definition found, using default values');
	}
	if (!fs.existsSync(path.join(config.data.tenderapi, 'import')))
		fs.mkdirSync(path.join(config.data.tenderapi, 'import'));
	let first = pack.timestamp;
	scrape(pack, function (err) {
		if (err) {
			logger.error('Error: ' + err);
		} else {
			if (fs.existsSync(path.join(config.data.tenderapi, 'package_continue.json'))) {
				fs.unlinkSync(path.join(config.data.tenderapi, 'package_continue.json'));
			}
			fs.writeFileSync(path.join(config.data.tenderapi, 'package_' + timestamp2filename(pack.timestamp) + '.json'), JSON.stringify(pack, null, '\t'));
			fs.writeFileSync(path.join(config.data.tenderapi, 'package_next.json'), JSON.stringify({first: first, timestamp: pack.timestamp}, null, '\t'));
			logger.info('done. (compressing might still running)');
		}
	});
};

start();

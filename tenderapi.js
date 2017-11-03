#!/usr/bin/env node

/*

 Collects the data from the Tender REST API and saves them into compressed import packages

 */

const path = require('path');
const request = require('request');
const fs = require('fs');
const lzma = require('lzma-native');

const config = require('./config.js');

let timestamp2filename = (timestamp) => {
	return timestamp.replace(/[\/:\.]/g, '-');
};

let now = function () {
	return new Date();
};

let log = (msg) => {
	console.log('' + now(), msg);
};

let scrape = (pack, cb) => {
	let running = 0;
	let done = false;

	let compress = function (filename, page) {
		running++;
		let error;
		let encoder = lzma.createStream('easyEncoder', {preset: 9});
		let outstream = fs.createWriteStream(path.join(config.data.tenderapi, 'import', filename + '.xz'));
		outstream.on('finish', function () {
			if (!error) {
				fs.unlink(path.join(config.data.tenderapi, 'import', filename));
				pack.files.push(filename + '.xz');
				log(filename + '.xz saved.');
			} else {
				pack.errors.push(filename);
			}
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

	let lpad = function (val) {
		let result = val.toString();
		while (result.length < 4) {
			result = '0' + result;
		}
		return result;
	};


	let get = function (page, retry, next) {
		log('requesting page: ' + page);
		let filename = config.api.main + '_' + timestamp2filename(pack.timestamp) + '_' + lpad(page) + '.json';
		let filestream = fs.createWriteStream(path.join(config.data.tenderapi, 'import', filename));
		let url = 'http://' + config.tenderapi.host + ':' + config.tenderapi.port + '/' + config.api.main + '/timestamp/' + pack.timestamp + (config.api.sub ? config.api.sub : '' ) + '/page/' + page;
		request
		.get(url,
			function (error, response, body) {
				log('handling response page: ' + page);
				if (!error && response && response.statusCode === 200) {
					compress(filename, page);
					if (body.length < 3) {
						next();
					} else {
						get(page + 1, 0, cb);
					}
				} else {
					if (response)
						log('error:' + response.statusCode + response.body);
					if (error)
						log(error);
					if (retry < 10) {
						log('waiting for retry ' + (retry + 1));
						setTimeout(function () {
							get(page, retry + 1, cb);
						}, 5000);
					} else {
						next(error || (response && response.statusCode))
					}
				}
			})
		.pipe(filestream)
	};

	get(pack.page, 0, function (err) {
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
		log('continue-package found');
		pack = JSON.parse(fs.readFileSync(path.join(config.data.tenderapi, 'package_continue.json')).toString());
	} else if (fs.existsSync(path.join(config.data.tenderapi, 'package_next.json'))) {
		log('next-package found');
		let nextpackage = JSON.parse(fs.readFileSync(path.join(config.data.tenderapi, 'package_next.json')).toString());
		pack.timestamp = nextpackage.timestamp;
	} else {
		log('No package definition found, using default values');
	}
	if (!fs.existsSync(path.join(config.data.tenderapi, 'import')))
		fs.mkdirSync(path.join(config.data.tenderapi, 'import'));
	scrape(pack, function (err) {
		if (err) {
			log('error: ' + err);
		} else {
			if (fs.existsSync(path.join(config.data.tenderapi, 'package_continue.json'))) {
				fs.unlink(path.join(config.data.tenderapi, 'package_continue.json'));
			}
			fs.writeFileSync(path.join(config.data.tenderapi, 'package_' + timestamp2filename(pack.timestamp) + '.json'), JSON.stringify(pack, null, '\t'));
			fs.writeFileSync(path.join(config.data.tenderapi, 'package_next.json'), JSON.stringify({timestamp: pack.timestamp}, null, '\t'));
			log('done.');
		}
	});
};

start();

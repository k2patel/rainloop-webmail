/* RainLoop Webmail (c) RainLoop Team | Licensed under MIT */
const path = require('path');


const config = {
	head: {
		mit: '/* RainLoop Webmail (c) RainLoop Team | Licensed under MIT */'
	},
	devVersion: '0.0.0',
	releasesPath: 'build/dist/releases',
	source: false,
	watch: false,
	watchInterval: 1000,
	googleCompile: false,

	rainloopBuilded: false,
	destPath: '',
	cleanPath: '',
	zipSrcPath: '',
	zipFile: '',

	paths: {}
};

config.paths.globjs = 'dev/**/*.js';
config.paths.static = 'rainloop/v/' + config.devVersion + '/static/';
config.paths.staticJS = 'rainloop/v/' + config.devVersion + '/static/js/';
config.paths.staticMinJS = 'rainloop/v/' + config.devVersion + '/static/js/min/';
config.paths.staticCSS = 'rainloop/v/' + config.devVersion + '/static/css/';
config.paths.momentLocales = 'rainloop/v/' + config.devVersion + '/app/localization/moment/';

config.paths.assets = {
	src: 'assets/**/*.*'
};

config.paths.less = {
	main: {
		src: 'dev/Styles/@Main.less',
		watch: ['dev/Styles/*.less'],
		options: {
			paths: [path.join(__dirname, 'dev', 'Styles'), path.join(__dirname, 'vendors', 'bootstrap', 'less')]
		}
	}
};

config.paths.css = {
	main: {
		name: 'app.css',
		src: [
			'node_modules/normalize.css/normalize.css',
			'node_modules/jquery-ui/themes/base/core.css',
			'node_modules/jquery-ui/themes/base/sortable.css',
			'node_modules/jquery-ui/themes/base/menu.css',
			'node_modules/jquery-ui/themes/base/autocomplete.css',
			'node_modules/jquery-ui/themes/base/theme.css',
			'vendors/fontastic/styles.css',
			'vendors/inputosaurus/inputosaurus.css',
			'vendors/flags/flags-fixed.css',
			'node_modules/opentip/css/opentip.css',
			'node_modules/pikaday/css/pikaday.css',
			'node_modules/glightbox/dist/css/glightbox.min.css',
			'node_modules/jodit/es2021/jodit.min.css',
			'dev/Styles/_progressjs.css'
		]
	},
	social: {
		name: 'social.css',
		src: ['vendors/fontastic/styles.css', 'dev/Styles/_social.css']
	}
};

config.paths.js = {
	moment: {
		locales: ['node_modules/moment/locale/*.js']
	},
	libs: {
		name: 'libs.js',
		src: [
			'node_modules/jquery/dist/jquery.min.js',
			'node_modules/jquery-migrate/dist/jquery-migrate.min.js',
			'node_modules/jquery-mousewheel/jquery.mousewheel.js',
			'node_modules/jquery-scrollstop/jquery.scrollstop.js',
			'node_modules/jquery-backstretch/jquery.backstretch.min.js',
			...[ 'version', 'widget', 'data', 'disable-selection', 'focusable', 'keycode', 'labels', 'plugin', 'position', 'scroll-parent', 'tabbable', 'unique-id', 'widgets/mouse', 'widgets/draggable', 'widgets/droppable', 'widgets/sortable', 'widgets/menu', 'widgets/autocomplete' ].map((name) => 'node_modules/jquery-ui/ui/' + name + '.js'),
			'vendors/inputosaurus/inputosaurus.js', // custom (modified)
			'node_modules/signals/dist/signals.min.js', // fixed
			'node_modules/hasher/dist/js/hasher.min.js', // fixed
			'node_modules/crossroads/dist/crossroads.min.js', // fixed
			'vendors/jua/jua.js', // custom
			'node_modules/keymaster/keymaster.js',
			'dev/External/Keymaster.js',
			'dev/External/LegacyUi.js',
			'node_modules/underscore/underscore-min.js',
			'node_modules/moment/min/moment.min.js',
			'node_modules/knockout/build/output/knockout-latest.js',
			'node_modules/knockout-sortable/build/knockout-sortable.min.js ',
			'node_modules/simplestatemanager/dist/ssm.min.js',
			'node_modules/autolinker/dist/Autolinker.min.js',
			'node_modules/opentip/lib/opentip.js',
			'node_modules/opentip/lib/adapter-jquery.js',
			'node_modules/glightbox/dist/js/glightbox.min.js',
			'node_modules/ifvisible.js/dist/ifvisible.global.js'
		]
	},
	app: {
		name: 'app.js'
	},
	admin: {
		name: 'admin.js'
	}
};

exports.config = config;

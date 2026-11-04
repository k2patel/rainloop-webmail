const path = require('path');
const webpack = require('webpack');


const devPath = path.resolve(__dirname, 'dev');
const devPathJoin = path.join(__dirname, 'dev');
const externalPathJoin = path.join(__dirname, 'dev', 'External');


const babelLoaderOptions = function() {
	return {
		ignore: [/\/core-js/],
		assumptions: { setPublicClassFields: true },
		cacheDirectory: true,
		overrides: [
			{
				test: './node_modules/',
				sourceType: 'unambiguous'
			}
		],
		presets: [
			[
				'@babel/preset-env',
				{
					targets: { chrome: '100', firefox: '102', safari: '16' },
					modules: false
				}
			]
		],
		plugins: [
			[
				'@babel/plugin-proposal-decorators',
				{
					version: 'legacy'
				}
			],
			[
				'@babel/plugin-transform-class-properties',
				{
				}
			]
		]
	};
};

module.exports = function(publicPath, mode) {
	return {
		mode: mode || 'development',
		devtool: 'inline-source-map',
		entry: {
			'js/polyfills': path.join(devPathJoin, 'polyfills.js'),
			'js/boot': path.join(devPathJoin, 'boot.js'),
			'js/app': path.join(devPathJoin, 'app.js'),
			'js/admin': path.join(devPathJoin, 'admin.js')
		},
		output: {
			pathinfo: true,
			path: path.join(__dirname, 'rainloop', 'v', '0.0.0', 'static'),
			filename: '[name].js',
			publicPath: publicPath || 'rainloop/v/0.0.0/static/'
		},
		performance: {
			hints: false
		},
		optimization: {
			concatenateModules: false,
			minimize: false
		},
		plugins: [
			new webpack.DefinePlugin({
				'process.env.NODE_ENV': JSON.stringify('production'),
				'process.env': {
					NODE_ENV: JSON.stringify('production')
				}
			}),
		],
		resolve: {
			modules: [devPath, 'node_modules'],
			extensions: ['.js'],
			alias: {
				'Opentip$': path.join(externalPathJoin, 'Opentip.js'),
				'ko$': path.join(externalPathJoin, 'ko.js')
			}
		},
		module: {
			rules: [
				{
					test: /\.js$/,
					loader: 'babel-loader',
					include: [devPath],
					options: babelLoaderOptions()
				},
				{
					test: /\.html$/,
					type: 'asset/source',
					include: [devPath]
				},
				{
					test: /\.css/,
					use: ['style-loader', 'css-loader'],
					include: [devPath]
				}
			]
		},
		externals: {
			'window': 'window',
			'progressJs': 'window.progressJs',
			'moment': 'window.moment',
			'ifvisible': 'window.ifvisible',
			'crossroads': 'window.crossroads',
			'hasher': 'window.hasher',
			'Jua': 'window.Jua',
			'Autolinker': 'window.Autolinker',
			'ssm': 'window.ssm',
			'key': 'window.key',
			'_': 'window._',
			'$': 'window.jQuery'
		}
	};
};

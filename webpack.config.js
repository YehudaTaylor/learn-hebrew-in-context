const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: {
      background: './src/background/background.ts',
      content: './src/content/content.ts',
      popup: './src/popup/popup.ts'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader'
          ]
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'public/manifest.json', to: 'manifest.json' },
          { 
            from: 'public/icons', 
            to: 'icons',
            globOptions: {
              ignore: ['**/placeholder.txt']
            }
          }
        ]
      }),
      new HtmlWebpackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup.html',
        chunks: ['popup']
      }),
      ...(isProduction ? [new MiniCssExtractPlugin()] : [])
    ],
    devtool: isProduction ? 'source-map' : 'inline-source-map'
  };
};
// webpack.config.js
module.exports = {
  entry: './jsx/Frontend.js',
  output: {
    path: __dirname + "/public/js",
    filename: 'bundle.js'       
  },
  module: {
    loaders: [
      { test: /\.js$/, loader: 'jsx-loader?harmony' } // loaders can take parameters as a querystring
    ]
  },
  resolve: {
    // you can now require('file') instead of require('file.coffee')
    extensions: ['', '.js', '.json'] 
  }
};
module.exports = (function() {
  var routes = require('./routes');

  // initialize routes
  routes.init();

  return routes;
})();
/**
 * define routes for Effex
 * @return {object} Routes
 */
module.exports = (function(ns) {


  // we'll need express
  ns.app = require('express')();
  
  // configs
  const configs = require ('./configs');
  
  // parameters for this instance
  const secrets = require ("./private/secrets");

  // we'll also need the response manager
  const respond = require ('./respond');

  // stats are handled in analytics
  const anal = require('./analytics');
  
  /* middleware */
  
  // CORS
  const copts = {
    origin: function (origin, callback) {
    // i could do whitelisting here .. test the origin against a list and replace true with result
    callback (null, true);
  }};
  
  // add a middleware to strip out the version number
  ns.app.use(function(req, res, next) {
    req.url = req.url.replace (configs.urlVersion,"");
    next();
  });

  ns.app.use(require('cors')(copts));
  
  // BODY PARSER
  // allow bigger than default posts
  const bodyParser = require("body-parser");
  ns.app.use(bodyParser.json({limit: secrets.bodyLimit}));
  ns.app.use(bodyParser.urlencoded({
     extended: true 
  }));
  
  // creates a .prom method to convert
  // responses into promises
  ns.app.use(prommy);

  // initialization
  ns.init = () => respond.init();

  /** routes **/
  
  // small interpolation of operation for the stats
  const addOp_ = (name, op, method) => {
    return op.then (pack=>{
      pack.operation=name;
      if (method)pack.method = method;
      return pack;
    });
  };
  
  //info
  ns.app.get('/info', 
    (req, res) => res.prom(addOp_("info",respond.info()))
  );
  
  // ping
  ns.app.get('/ping', 
    (req, res) => res.prom(addOp_("info",respond.ping()))
  );
  
  
  // validate/:key
  ns.app.get('/validate/:key', 
    (req, res) => res.prom(addOp_("validate",respond.validate(paramSquash_(req))))
  );


  // write an item with get
  ns.app.get('/writer/:writer', 
    (req, res) => res.prom(addOp_("write",respond.writeItem(paramSquash_(req))))
  );
  
  // write an item with post
  ns.app.post('/writer/:writer', 
    (req, res) => res.prom(addOp_("write",respond.writeItem(paramSquash_(req)),"set"))
  );
  
  // write an item with alias
  ns.app.get('/writer/:writer/alias/:alias', 
    (req, res) => res.prom(addOp_("writeAlias",respond.writeItem(paramSquash_(req)),"set"))
  );
  
  // write an item with post with alias
  ns.app.post('/writer/:writer/alias/:alias', 
    (req, res) => res.prom(addOp_("writeAlias",respond.writeItem(paramSquash_(req)),"set"))
  );

  // update and item with get
  ns.app.get('/updater/:updater/:id', 
    (req, res) => res.prom(addOp_("update",respond.updateItem(paramSquash_(req)),"set"))
  );
  
  // update an item with post
  ns.app.post('/updater/:updater/:id', 
    (req, res) => res.prom(addOp_("update",respond.updateItem(paramSquash_(req)),"set"))
  );
  
  // read the item
  ns.app.get('/reader/:reader/:id', 
    (req, res) => res.prom(addOp_("read",respond.readItem(paramSquash_(req))))
  );

  // delete watcher
  ns.app.delete("/offregister/:watchable", 
    (req, res) => res.prom(addOp_("offRegister",respond.offRegister(paramSquash_(req)),"remove"))
  );

    
  // remove
  ns.app.delete('/writer/:writer/:id', 
    (req, res) => res.prom(addOp_("remove",respond.removeItem(paramSquash_(req)),"remove"))
  );

  // register alias
  ns.app.get('/:writer/:key/alias/:alias/:id', 
    (req, res) => res.prom(addOp_("registerAlias",respond.registerAlias(paramSquash_(req)),"set"))
  ); 
  
  ns.app.post('/:writer/:key/alias/:alias/:id', 
    (req, res) => res.prom(addOp_("registerAlias",respond.registerAlias(paramSquash_(req)),"set"))
  );
  
  ns.app.delete ('/release/:id/:updater/:intent', 
    (req, res) => res.prom(addOp_("releaseIntent",respond.releaseIntent(paramSquash_(req)),"remove"))
  );

  ns.app.get ('/onregister/:reader/:id/:event',
    (req, res) => res.prom(addOp_("onRegister",respond.onRegister(paramSquash_(req)),"set"))
  );

  ns.app.post ('/onregister/:reader/:id/:event',
    (req, res) => res.prom(addOp_("onRegister",respond.onRegister(paramSquash_(req)),"set"))
  );
  
  //-- get logged events
  ns.app.get('/eventlog/:reader/:id/:event',     
   (req, res) => res.prom(addOp_("getEventlog",respond.getEventlog(paramSquash_(req))))
  );
  
  //-- get the watchable
  ns.app.get('/watchable/:watchable/:reader', 
    (req, res) => res.prom(addOp_("getWatchable",respond.getWatchable(paramSquash_(req))))
  );
  
    //-- get the watchable
  ns.app.get('/quotas', 
    (req, res) => res.prom(addOp_("getQuotas",respond.getQuotas(paramSquash_(req))))
  );
  
  // generate keys - 
  ns.app.get('/generate/:bosskey/:mode', 
    (req, res) => res.prom(addOp_("generateKeys",respond.generateKeys(paramSquash_(req))))
  ); 
 
  // admin - can only be called with an profile authid as a body or url pararm
  // PROFILES AND ACCOUNTS

  // add an account
  ns.app.put('/admin/addaccount', function(req, res) {
    res.prom(addOp_("admin/addAccount",respond.addAccount(paramSquash_(req)),"set"));
  });
  
  // delete an account
  ns.app.delete('/admin/account/:accountid', function(req, res) {
    res.prom(addOp_("admin/removeAccount",respond.removeAccount(paramSquash_(req)),"remove"));
  });
  
  // check acccount exists and is active
  ns.app.get('/admin/account/:accountid', function(req, res) {
    res.prom(addOp_("admin/getAccount",respond.getAccount(paramSquash_(req))));
  });
  
  // this is a PUT because this gets a a user profile
  // for a firebase ID in the body - actually the authId
  // alsp needs an admin key
  ns.app.put('/admin/profile', function(req, res) {
    res.prom(addOp_("admin/profilePut",respond.profile(paramSquash_(req))));
  });
  
  // the same as profile, except it doesn't create anything
  ns.app.get("/admin/profile", function(req, res) {
    res.prom(addOp_("admin/profileGet",respond.profile(paramSquash_(req),true)));
  });
  
  // delete a profile
  ns.app.delete("/admin/profile", function(req, res) {
    res.prom(addOp_("admin/removeProfile",respond.removeProfile(paramSquash_(req))));
  });
  





  // generate a bossKey



  // this is a special admin one for deleting all expired items
  ns.app.delete("/admin/expired", 
    (req, res) => res.prom(addOp_("admin/expired",respond.removeExpired(paramSquash_(req)),'remove'))
  );

  ns.app.get("/admin/stats", function(req, res) {
    res.prom(addOp_("admin/getStats",respond.getStats(paramSquash_(req))));
  });
  
  ns.app.get("/admin/stats/:accountId", function(req, res) {
    res.prom(addOp_("admin/getStats/account",respond.getStats(paramSquash_(req))));
  });
  
  
  // generate a boss key for an account
  // type should always be boss for now.
  ns.app.get("/admin/account/:accountid/boss/:plan", 
    (req, res) => res.prom(addOp_("admin/generateBoss",respond.generateBoss(paramSquash_(req)),'set'))
  );


  
  
  // prune any boss keys associated with an account .. in other words, delete boss keys for an account
  ns.app.delete("/admin/prune/:accountid", function(req, res) {
    res.prom(addOp_("admin/pruneBosses",respond.pruneBosses(paramSquash_(req)),"remove"));
  });

  
  // delete a list of bosses - using .put rather than delete as payloads not allowed in some delete clients
  ns.app.put("/admin/bosses", function(req, res) {
    res.prom(addOp_("admin/removeBosses",respond.removeBosses(paramSquash_(req)),"remove"));
  });
  
  // but delete is supported too.
  ns.app.delete("/admin/bosses", function(req, res) {
    res.prom(addOp_("admin/removeBosses",respond.removeBosses(paramSquash_(req)),"remove"));
  });
  

  // get any boss keys associated with an account 
  ns.app.get("/admin/bosses/:accountid", function(req, res) {
    res.prom(addOp_("admin/getBosses",respond.getBosses(paramSquash_(req))));
  });
    

  // generate keys - thisll be retired and replaced by the one above
  ns.app.get('/:bosskey/:mode', 
    (req, res) => res.prom(addOp_("generateKeysLegacy",respond.generateKeys(paramSquash_(req))))
  ); 
  
  // deal with 404
  ns.app.all ("/*" , function (req, res) {
    res.status (404).send({ok:false, code:404,error:"api path doesnt exist"});
  });
  
  return ns;


  /** local functions **/

  // this is a middleware to handle promises in the router
  function prommy(req, res, next) {
    res.prom = function(prom, contentType) {
      prom.then(function(result) {
          doRes(result, contentType, 200);
        })
        .catch(function(error) {
          doRes(error, contentType, 500);
        });
    };
    next();
    
    // handles the result
    // and does analytics
    function doRes(message, contentType, status) {
      
      // don't bother waiting for a response from analytics.
      // not all of these will be populated
      if (typeof message === "object") {
        // admin operations will hide keys
        const isAdmin = (message.operation || "").indexOf ("admin/") ===0;
        anal.hit  ( {
          action:message.operation , 
          method:message.method , 
          accountId:message.accountId, 
          key:!isAdmin && ( message.writer || message.updater || message.reader ),
          size:message.size,
          status:message.code,
          eventDate:new Date().getTime()
        });
      }
      else {
        anal.hit ("badresponse");
      }
      
      if (contentType) {
        res.set('Content-Type', contentType);
        res.status(status || 200).send(message);
      }
      else {
        res.set('Content-Type', "application/json");
        res.send(JSON.stringify(message));
      }
    }
  }
  
  /**
   *  for convenience, params and query and body will be treated as one
   *  like that i can use post or get for most things
   *  as some clients cant post
   */
  function paramSquash_(req) {

    function clone_(ob, init) {
      return ob ?
        Object.keys(ob)
        .reduce(function(p, c) {
          p[c] = ob[c];
          return p;
        }, init) : {};
    }

    // order of precendence
    return clone_(req.params, clone_(req.query, clone_(req.body, {})));

  }

})({});

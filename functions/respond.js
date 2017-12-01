/**
 * firestore functions abstracted
 */
module.exports = (function(ns) {


  // contains useful stuff
  const handy = require('./handy');
  const manage = require('./manage');

  // this is database handler
  const dbStore = require('./dbstore');
  const configs = require('./configs');
  
  // and need to be able to get stats
  const anal = require("./analytics");

  // needs to be called at beginning of app somewhere
  ns.init = () => {
    dbStore.init();
    return ns;
  };

  /**
   * ping
   */
  ns.ping = () => {

      
    return dbStore.ping()
      .then(pack => {
        if (pack.ok && pack.value && pack.value.response) {
          pack.value = pack.value.response;
        }
        return pack;
      });

  };

  /**
   * info
   */
  ns.info = () => {

    
    return Promise.resolve(manage.goodPack({
      info: {
        api: configs.apiName,
        version: configs.version,
        platform:configs.platform
      }
    }))};

  /**
   * validate/:key
   */
  ns.validate = (params) => {
    const pack = manage.getCouponPack(params.key, params);
    return Promise.resolve(pack);
  };
  
  /**
   * /admin/profile
   * need an authID which is the firebase id
   * if create is true then we're allowed to create a new profile
   */
  ns.addAccount = (params) => {
    
    // make sure we have auth and admin
    const pack = manage.checkPriv (params); 
    if (!pack.ok) return Promise.resolve (pack);

    // next we need to get the profile
    // this wil use the params.create if tru then it will create both
    // a new profile and a new account (if it doesnt already exit)
    return dbStore.profile ({
      authId:params.authid || params.data.authid, 
      createAccount:true, 
      planId:params.planid
    });

  };
  
    /**
   * /admin/profile
   * need an authID which is the firebase id
   * if create is true then we're allowed to create a new profile
   */
  ns.updateAccount = (params) => {
    
    // make sure we have auth and admin
    const pack = manage.checkPriv (params); 
    if (!pack.ok) return Promise.resolve (pack);
    
    const active = parseInt (params.active,10);
    // check we have a resource
    manage.errify (
      params.hasOwnProperty ("active") && (active === 0 || active ===1 ),
      "BAD_REQUEST",
      "need an active=1 or 0 parameter",
      pack);

    // next we need to get the profile
    // this wil use the params.create if tru then it will create both
    // a new profile and a new account (if it doesnt already exit)
    return dbStore.profile ({
      authId:params.authid || params.data.authid, 
      accountId:params.accountid,
      updateAccount:true, 
      active:active ? true : false
    })
    .catch(err=>Promise.resolve(manage.errify(false,"INTERNAL",err,pack)));

  };

  /**
   * /admin/profile
   * need an authID which is the firebase id
   * if create is true then we're allowed to create a new profile
   * the planID can be passed or it will take it
   * from the default
   * accounts inherit a planID from the user
   */
  ns.profile = (params, readOnly) => {
    
    // make sure we have auth and admin
    const pack = manage.checkPriv (params); 
    if (!pack.ok) return Promise.resolve (pack);

    return dbStore.profile ({
      authId:params.authid || params.data.authid, 
      createProfile:readOnly ? false: true, 
      planId:params.planid
    });
    

  };
  
  
  /**
   * /admin/account/:accountid
   */
  ns.getAccount = (params) => {
    
    const pack = manage.goodPack({
      accountId:params.accountid
    });
    
    return ns.profile (params, true)
      .then (result=> {
        // this is the entire profile so trim it down
        manage.errify(result.ok , result.code , result.error, pack);
        manage.errify (result.value && result.value.accounts && result.value.accounts[params.accountid],"NOT_FOUND","account not found",pack);
       
        if (pack.ok) {
          pack.value = result.value.accounts[pack.accountId];
        }
        return pack;
      })
      .catch(err=>Promise.resolve(manage.errify(false,"INTERNAL",err,pack)));
      

  };
  
  // get stats from analytics
  ns.getStats = (params) => {
    
    return anal.getStats(params);

  };

  
 
  /**
   * check an account exists - it doesnt need an authid or an admin key
   * as it's generally used to check an account is active and exists 
   * for regular operations.
   * @param {object||string} pack the pack so far or an account ID
   * @return {Promise} the updated pack
   */
  ns.checkAccount = (account) => {

    const pack = typeof account === "object" ? account : manage.goodPack ({
      accountId:account
    });

    // now to a query based on the accountID (we don't necessary know the authID, so it can't be a direct)
    return dbStore.queryAccounts (pack.accountId)
    .then(result=>{
      manage.errify (result.ok , result.code, result.error , pack);
      return manage.errify (result.value && result.value.length , "UNAUTHORIZED", "account not active",pack);
    })
    .catch(err=>Promise.resolve (false, "INTERNAL", err ,pack));

  };
  /**
   * generate other kinds of keys
   */
  ns.generateKeys = (params) => {

  
    //generate a pack for the boss key    
    const bossPack = manage.getCouponPack(params.bosskey, params);
    if (!bossPack.ok) return Promise.resolve(bossPack);

    // get the seed for this boss key
    const seed = manage.findSeed(bossPack.key);
    manage.errify(seed, "INTERNAL", "cant find seed for key", bossPack);

    // theres currently only one kind of boss, but for later this will check it can make this kind of key
    manage.errify(seed.type === "boss" && seed.boss, "INTERNAL", "wrong type of boss key", bossPack);
    manage.errify(seed.boss && seed.boss.indexOf(params.mode) !== -1,
      "BAD_REQUEST", "your boss key doesn't allow you to generate " + params.mode + " keys", bossPack);
    manage.errify(bossPack.accountId, "INTERNAL", "account id is missing", bossPack);
    const ak = manage.findAk(seed, params.mode);
    manage.errify(ak, "INTERNAL", "cant find key to swap for boss key", bossPack);
    manage.errify(!(params.days && params.seconds), "BAD_REQUEST", "choose either seconds or days for key duration", bossPack);
    if (!bossPack.ok) return Promise.resolve(bossPack);

    // make the keys
    var pack = manage.makeKeys(bossPack, ak, params);

    // check the boss key exists
    return dbStore.getBoss(bossPack.key)
      .then(result => {
        manage.errify(result.ok, result.code, result.error, pack);
        return pack.ok ? ns.checkAccount(bossPack) : pack;
      })
      .then(result => {
        manage.errify(result.ok, result.code, result.error, pack);
        return pack;
      });

  };

  // remove all expired items
  ns.removeExpired = (params) => {


    // we need an admin key
    const pack = manage.goodPack();
    if (!manage.checkAdmin(params.admin, pack).ok) return Promise.resolve(pack);
    return dbStore.removeExpired();
  };

  /**
   * remove an item
   */
  ns.removeItem = (params) => {

    // allow removing with only a writer key
    const keyPack = manage.getCouponPack(params.writer, params);

    manage.errify(
      keyPack.type === "writer",
      "UNAUTHORIZED",
      "You need a writer key to remove items",
      keyPack);

    // lets bow out
    if (!keyPack.ok) return Promise.resolve(keyPack);

    //---so the key makes sense - start working on the data
    const pack = {
      ok: true,
      id: params.id,
      plan: keyPack.plan,
      accountId: keyPack.accountId,
      session: params.session || "",
      writer: keyPack.key
    };

    return dbStore.removeItem(

        // this is how to check an account is valid and active
        () => ns.checkAccount(pack),

        () => {
          // this is how to check of an item could be an alias

          return Promise.resolve({
            itemPack: ns.checkIfItem(handy.clone(pack), params),
            pack: handy.clone(pack)
          });
        },

        // this patches the pack with alias data
        (result) => Promise.resolve(ns.parkAliasResult(result, pack, params))

      )
      .catch(err => manage.errify(err.ok, err.code, err.error, pack));

  };

  /**
   * register an alias
   */
  ns.registerAlias = (params) => {

    // allow registering with amy kind of keys, but must have a writer to create it
    const writerPack = manage.getCouponPack(params.writer, params);
    if (!writerPack.ok) return Promise.resolve(writerPack);


    // get the access key to register against
    const accessPack = manage.getCouponPack(params.key, params);
    if (!accessPack.ok) return Promise.resolve(accessPack);

    // check the id is good
    const pack = manage.getCouponPack(params.id, params);
    if (!pack.ok) return Promise.resolve(pack);

    // create the pack
    pack.alias = params.alias;
    pack.key = accessPack.key;
    pack.writer = writerPack.key;
    pack.id = params.id;
    pack.type = "alias";
    pack.lockValue = (params.lock || "");


    // the rest doesnt really need to be a transaction as its no big deal if the item disappears
    // half way through
    // its also ok if the key is not allowed to access this item, although the writer key needs to match
    // as updater/reader lists can be changed after this
    return dbStore.getItem(pack.id)
      .then(result => {
        manage.errify(result.ok, result.code, result.error, pack);
        const content = result.value;
        manage.errify(content && content.meta, "INTERNAL", "no meta data found", pack);
        if (pack.ok) {
          const meta = content.meta;
          manage.errify(
            meta.writer === pack.writer,
            "UNAUTHORIZED",
            "Only the original writer key can make aliases",
            pack
          );
        }
        if (!pack.ok) return pack;

        // now we can write the alias
        const keyInfo = [{
            key: pack.key,
            expires: content.expires
          }];
          
        return dbStore.setAlias(pack, keyInfo)
        .then(result => {
            return manage.errify(result.ok, result.error, result.error, pack, "CREATED");
         });

      });

  };

  const checkKeyType_ = (pack, expected, mess) => {
    if (!Array.isArray(expected)) expected = [expected];
    return manage.errify(
      expected.some(d => d === pack.type),
      "UNAUTHORIZED",
      "You need a " + expected.join(" or ") + "key to " + mess,
      pack);
  };
  
  const checkAccountMatches_ = (pack, keyPack) => {

    return manage.errify(
      pack.accountId === keyPack.accountId,
      "UNAUTHORIZED",
      "Theses keys are for different accounts",
      pack);
  };
  


  /**
   * releases an intent
   */
  ns.releaseIntent = (params) => {

    const keyPack = checkKeyType_(
      manage.getCouponPack(params.updater, params),
      "updater",
      "release intents"
    );
    if (!keyPack.ok) return Promise.resolve(keyPack);

    
    const intentPack = checkKeyType_(
      manage.getCouponPack(params.intent, params),
      "intent",
      "release intents"
    );
    if (!intentPack.ok) return Promise.resolve(intentPack);

    const idPack = checkKeyType_(
      manage.getCouponPack(params.id, params),
      "item",
      "release intents"
    );
    if (!idPack.ok) return Promise.resolve(idPack);
    idPack.intent = intentPack.key;
    idPack.updater = keyPack.key;
    idPack.id = idPack.key;

    // all keys are good, we can just delete that
    return dbStore.removeIntent(() => ns.checkAccount(idPack), idPack);

  };

  /**
   * get a slot if no limits are broken
   */
  ns.getSlotLimit = (pack , volume) => {
    
    const plan = configs.plans[pack.plan];
    manage.errify (plan , "INTERNAL", "plan " + pack.plan + " unknown", pack);
    const accountId = pack.accountId;
    manage.errify (plan , "INTERNAL", "accountId missong", pack);
    if (!pack.ok) return Promise.resolve (pack);
    
    // get the ratelimit item and update it
    // wewont bother with transactions
    // dont care if a few slip through
    // and we probably wont wait until the update is committed either
    // a subsequent failure also still counts against rate
    return dbStore.getSlotLimit (accountId)
      .then (pack=>{
        // a not found is classed as ok
        if (!pack.ok && pack.code !== manage.findCode("NOT_FOUND")) return pack;
        
        // now initialize the data
        const currentOb = pack.value || {};
        
        // now reinitialize a good starting point
        pack = manage.goodPack();        
        const nowSecs = new Date().getTime()/1000;
        const ob = Object.keys(plan.limiters)
        .reduce((p,name)=>{
            const co = plan.limiters[name];
            
            // calculate the measurement slot we're currently in
            // the plan defines the measurement window as a number of seconds
            const slot = Math.floor(nowSecs/co.seconds);
            
            // inherit the existing one or initialize a new onw
            // if the slot has changed or doesnt exist
            p[name] = currentOb[name];
            if (!p[name] || p[name].slot !== slot) {
              p[name] = {
                used:0,
                slot:slot
              };
            }
            
            // now update the slot by the attempted amount
            p[name].used += (co.type === "quota" ? volume : 1);
            manage.errify(
              p[name].used <= co.rate,
              "QUOTA",
              name + " quota/rate limit exceeded",
              pack
            );
        
            return p;
        },{});
        
        // if slot was accepted, write it out but don;t bother waiting for a response
        if (pack.ok) {
          // may as well expire it in a while
          ob.expires = manage.settings.slotLimitLifetime + new Date().getTime();
          dbStore.setSlotLimit (accountId,ob)
            .then (result=> {
              if (!result.ok) console.error ('failed to write rate limit ', result);
            })
            .catch (err=>console.error ('failed to write rate limit ', err));
        }
        return pack;
      });
    
  };
  /**
   * get rate limits
   */
  ns.getQuotas = () => {
    return Promise.resolve(manage.goodPack({
      quotas: configs.plans
    }));
    
    /*
         ns.checkQuota = (data , pack) => {
    // TODO ratelimiting not yet implemented
    const plan = configs.plans[pack.plan];
    */
  };
    
  

  /**
   * updates an item
   */
  ns.updateItem = (params) => {

    // allow writing with either writer or updater keys
    const keyPack = manage.getCouponPack(params.updater, params);

    manage.errify(
      keyPack.type === "writer" || keyPack.type === "updater",
      "UNAUTHORIZED",
      "You need a writer or updater key to update items",
      keyPack);

    // how long the item should last
    manage.errify(!params.lifetime,
      "FORBIDDEN",
      "You cant change the lifetime of an existing item",
      keyPack);

    // check that the intent makes sense if given
    if (params.intent) {
      const intentPack = manage.getCouponPack(params.intent, params);
      keyPack.intent = intentPack.key;
      manage.errify(
        intentPack.ok,
        intentPack.code,
        intentPack.error,
        keyPack
      );

      manage.errify(
        intentPack.accountId === keyPack.accountId,
        "BAD_REQUEST",
        "intent key not for this account",
        keyPack
      );
    }
    // conv data to an ob if poss
    const data = handy.tryParse(params.data);
    // conv data to an ob if poss
    manage.errify(!handy.isUndefined(data),
      "BAD_REQUEST",
      "You need to provide some data",
      keyPack
    );

    const dWrite = (data && JSON.stringify(data)) || "";

    // cehck there's not too much
    manage.checkQuota(dWrite, keyPack);

    // lets bow out
    if (!keyPack.ok) return Promise.resolve(keyPack);

 
    //---so the key makes sense - start working on the data
    const pack = {
      ok: true,
      id: params.id,
      plan: keyPack.plan,
      accountId: keyPack.accountId,
      session: params.session || "",
      updater: keyPack.key
    };

    if (params.intent) pack.intent = params.intent;


    // can only change accessors if its a writer key
    manage.errify(
      keyPack.type === "writer" ||
      ((!pack.readers || !pack.readers.length) && (!pack.updaters || !pack.updaters.length)),
      "FORBIDDEN",
      "Only writer keys can change updaters/readers list",
      pack
    );
    if (!pack.ok) return Promise.resolve(pack);

    // get a rate slot
    return ns.getSlotLimit(pack , dWrite.length )
    .then (result=> {
      manage.errify (result.ok , result.code, result.error , pack);
      return !pack.ok ? pack : dbStore.updateItem(dWrite,

        // this is how to check an account is valid and active
        () => ns.checkAccount(pack),

        () => {
          // this is how to check of an item could be an alias
          return Promise.resolve({
            itemPack: ns.checkIfItem(handy.clone(pack), params),
            pack: handy.clone(pack)
          });
        },

        // this patches the pack with alias data
        (result) => Promise.resolve(ns.parkAliasResult(result, pack, params)),

        // this ensures that an accessKey is allowed to update a given item
        (writer, arr) => {

          return pack.updater === writer || (arr || []).some(d => d === pack.updater);
        }
      );
    })
    .catch(err => manage.errify(err.ok, err.code, err.error, pack));

  };

  /**
   * write an alias
   * @param {object} inPack the item pack
   * @param {object} params
   * @return {Promise}
   */
  ns.writeAlias = (inPack, params) => {

    const pack = handy.clone(inPack);

    // if no alias then nothing to do
    if (!pack.ok || !pack.alias) return Promise.resolve(pack);
    let kp = manage.getCouponPack(pack.id, params);
    // get the expiry date of the item
    const idExpiry = new Date(kp.validtill).getTime();

    // make the keys needed to apply to this alias
    const keyInfo = [pack.writer, pack.reader, pack.updater, pack.updaters, pack.readers]
      .reduce((p, c) => {
        if (c) {
          if (!Array.isArray(c)) c = [c];
          c.forEach(function(d) {
            let kp = manage.getCouponPack(d, params);
            p.push({
              key: kp.key,
              expires: Math.min(idExpiry, new Date(kp.validtill).getTime())
            });
          });
        }
        return p;
      }, []);

    // check we found something
    manage.errify(
      keyInfo.length,
      "INTERNAL",
      "Didnt find any keys to alias",
      pack
    );

    if (!pack.ok) return Promise.resolve(pack);

    // now create alias

    return dbStore.setAlias(pack, keyInfo)
      .then(result => {
        return manage.errify(result.ok, result.error, result.error, pack);
      });
  };

  /**
   * writes an item
   */
  ns.writeItem = (params) => {

    // allow writing with just writer keys
    const keyPack = manage.getCouponPack(params.writer, params);

    manage.errify(
      keyPack.type === "writer",
      "UNAUTHORIZED",
      "You need a writer key to be able to write new items",
      keyPack);

    manage.errify(!keyPack.intent,
      "BAD_REQUEST",
      "You cant specify an intent for a new item", keyPack);

    // conv data to an ob if poss
    const data = handy.tryParse(params.data);
    manage.errify(!handy.isUndefined(data), "BAD_REQUEST", "You need to provide some data", keyPack);
    const dWrite = (data && JSON.stringify(data)) || "";


    // cehck there's not too much
    manage.checkQuota(dWrite, keyPack);
    if (!keyPack.ok) return Promise.resolve(keyPack);

    //---so the key makes sense - start working on the data
    const pack = {
      ok: true,
      id: params.id,
      plan: keyPack.plan,
      accountId: keyPack.accountId,
      session: params.session || "",
      writer: keyPack.key
    };

    if (params.alias) pack.alias = params.alias;

    // can specify accessors
    if (pack.ok) {
      ["readers", "updaters"].forEach(function(d) {
        manage.checkAccessors(params, pack, d);
      });
    }

    // how long the item should last
    pack.lifetime = params.lifetime ? parseInt(params.lifetime, 10) : 0;
    manage.prepareLifetime(pack);

    // now we need to generate since its a new item
    const coupon = manage.makeItemCoupon(pack);

    manage.errify(coupon && coupon.ok, "INTERNAL", "failed to generate item id", pack);
    if (pack.ok) {
      pack.id = coupon.code;
    }
    else {
      return Promise.resolve(pack);
    }

    // write the thing out
    const slim = ns.getSlotLimit(pack , dWrite.length )
    .then (result=> manage.errify (result.ok , result.code, result.error , pack));
  
    return slim.then (result=>!result.ok ? result : dbStore.setItem(pack, dWrite))
      .then(result => {
        pack.size = dWrite.length || 0;
        return manage.errify(result.ok, result.code, result.error, pack, "CREATED");
      })
      .then(pack => {
        return ns.writeAlias(pack, params);
      })
      .then(result => {
        return manage.errify(result.ok, result.code, result.error, pack);
      })
      .catch(errPack => {
        return Promise.resolve(errPack);
      });

  };

  /*
   * @param {object} pack
   * @param {object} params
   * @return {pack|null} pack if its an item key, null if not
   */
  ns.checkIfItem = (pack, params) => {

    //if there's not a pack id or theres been an error then there's nothing to do
    if (!pack.id || !pack.ok || manage.isItemKey(pack.id, params)) {
      let idPack = manage.getCouponPack(pack.id, params);
      pack.validtill = idPack.validtill;
      return manage.errify(idPack.ok, idPack.code, idPack.error, pack);
    }
    // its not an item key
    return null;
  };

  /*
   * fix up a pack based on the result of an alias query
   * @param {object} result the result of an alias query
   * @param {object} pack the current pack
   * @return {object} pack a pack
   */
  ns.parkAliasResult = (result, pack, params) => {

    manage.errify(result.ok, result.code, result.error, pack);
    if (pack.ok) {
      pack.alias = pack.id;
      pack.id = result.value.id;
      let idPack = manage.getCouponPack(pack.id, params);
      pack.validtill = idPack.validtill;
      manage.errify(idPack.ok, idPack.code, idPack.error, pack);
    }
    return pack;

  };


  /**
   * create an intent
   * @param {object} pack the pack so far
   * @return {object} {pack:pack , intentCoupon: string}
   */
  ns.createIntent = (pack) => {

    // if we dont have any intention, then nothing to do
    if (!pack.intention) return Promise.resolve(pack);

    // now create an intention
    manage.errify(
      pack.intention === "update",
      "BAD_REQUEST",
      "intention parameter should be 'update' not " + pack.intention,
      pack
    );
    const coupon = manage.makeIntention(pack);

    return {
      pack: pack,
      intentCoupon: coupon
    };


  };

  /**
   * handles the getting of an item from the url request
   * @param {object} params
   * @param {boolean} ignoreData whether to ignore data in the params
   * @return {Promise}
   */
  ns.readItem = function(params, ignoreData) {

    // get and validate the apikey
    const keyPack = manage.getCouponPack(params.reader, params);
    if (!keyPack.ok) {
      return Promise.resolve(keyPack);
    }

    // start generating the response
    let pack = manage.goodPack({
      reader: params.reader,
      id: params.id,
      accountId: keyPack.accountId,
      plan: keyPack.plan
    });

    // if there's an intention key
    if (params.intention) {
      pack.intention = params.intention;
    }

    // check we have an id
    manage.errify(pack.id, "BAD_REQUEST", "You need to supply an ID", pack);
    manage.errify(!params.data || ignoreData, "BAD_REQUEST", "A read request shouldn't include data", pack);

    // an intention must include an updater or writer key
    manage.errify(!pack.intention || (keyPack.type === "writer" || keyPack.type === "updater"),
      "BAD_REQUEST",
      "an read with intention must use a writer or updater key",
      pack);

    if (!pack.ok) {
      return Promise.resolve(pack);
    }

    // write the thing out
    const slim = ns.getSlotLimit(pack , 0 )
    .then (result=> manage.errify (result.ok , result.code, result.error , pack));
  
    return slim.then (result=>!result.ok ? result : dbStore.readItem(


        // this is how to check an account is valid and active
        () => ns.checkAccount(pack),

        // this is how to check of an item could be an alias      
        () => Promise.resolve({
          itemPack: ns.checkIfItem(handy.clone(pack), params),
          pack: handy.clone(pack)
        }),

        // this patches the pack with alias data
        (result) => Promise.resolve(ns.parkAliasResult(result, pack, params)),

        // this ensures that an accessKey is allowed to update a given item
        (writer, arr) =>
        pack.reader === writer || (arr || []).some(d => d === pack.reader),

        // this is how to make an intention key
        (pack) => manage.getCouponPack(manage.makeIntention(pack), params)
      ))
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err, pack)));

  };

  /**
   * get watchable
   * ns.app.get("/watchable/:watchable/:reader",
   */
  ns.getWatchable = (params) => {
    
    const keyPack = checkKeyType_(
      manage.getCouponPack(params.reader, params),
      ["updater","reader","writer"],
      "read watchable"
    );
    if (!keyPack.ok) return Promise.resolve(keyPack);
    
    const watchablePack = checkKeyType_(
      manage.getCouponPack(params.watchable, params),
      ["watchable"],
      "read watchable"
    );
    if (!watchablePack.ok) return Promise.resolve(watchablePack);
    
    checkAccountMatches_ (watchablePack , keyPack);
    if (!watchablePack.ok) return Promise.resolve (watchablePack);
    
    // keys are ok, now get the watchable if its for the right account

    
    return dbStore.readWatchable(watchablePack.key)
      .then(pack=>{
        if (!pack.ok) return pack;
        // format watchable to standard form
        return manage.errify (
          true, 
          "INTERNAL", 
          "scotty", 
          manage.goodPack(manage.makeSxpacket(pack.value, keyPack.type==="writer"))
        );
      });
    
  };
  /**
   * get items since last time
   * @param {object} params the params
   * @return {Promise} the result
   * /eventlog/:reader/:id/:event
   */
  ns.getEventlog = (params) => {

    var now = new Date().getTime();


    // this is about making sure we have auth to read the thing, and resolveing the alias
    return ns.readItem(params)
      .then(pack => {
        pack.event = params.event;

        // we don't actually want the data values
        delete pack.value;
        if (!pack.ok) return { pack: pack };

        
        // get the watchables
        return dbStore.queryWatchables(pack.id, pack.event)
          .then(result => {
            return {
              pack: pack,
              docs: result
            };
          });

      })
      .then(result => {

        const pack = result.pack;
        const docs = result.docs;
        

        // sanitize the response
        // if the key is the writer we can expose the message
        const keyPack = manage.getCouponPack(pack.reader , params);
        manage.errify (
          keyPack.ok,
          keyPack.code,
          keyPack.error,
          pack
        );
        if (!pack.ok) return pack;

                
        pack.watchables = docs.map((doc) => {
          const wd = doc.data();
          const ob = {
            options:wd.options,
            watchable:doc.id,
            values:Object.keys(wd.observations).map(k=>wd.observations[k]),
            latestObservation:wd.latestObservation,
            created:wd.created,
            event:wd.event
          };
          // hide the message if not a writer key
          if (keyPack.type !== "writer" && ob.options && ob.options.message){
            delete ob.options.message;
          }
          return ob;

        });
        return pack;
      })

      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));

  };
 
 /**
   * unregister watchable
   * @param
   */
  ns.offRegister = (params) => {

    // this doesnt explicitly need a key - perhaps it should TODO
    // check the key makes sense
    var watchablePack = manage.getCouponPack(params.watchable, params);
    if (!watchablePack.ok) return Promise.resolve(watchablePack);

    const keyPack = checkKeyType_(
      manage.getCouponPack(params.watchable, params),
      "watchable",
      "remove watchables"
    );
    if (!keyPack.ok) return Promise.resolve(keyPack);

    
    return dbStore.removeWatchable (keyPack);

  };
  
  /**
   * make an on register
   */
  ns.onRegister = (params) => {

    // start by reading the item to make sure we have access to it
    return ns.readItem(params, true)
      .then(itemPack => {
        manage.errify (
          params.data,
          "BAD_REQUEST",
          "onregister needs data parameter with log options",
          itemPack
        );
        if (!itemPack.ok) return itemPack;

        //  now start to construct the onResponse
        const pack = manage.goodPack({
          id: itemPack.id,
          reader: itemPack.reader,
          validtill: itemPack.validtill,
          alias: itemPack.alias || "",
          event: params.event,
          accountId: itemPack.accountId,
          plan: itemPack.plan,
          options: params.options,
          session: params.session || ""
        });


        // check the event
        if (!manage.errify(
            pack.event === "update",
            "BAD_REQUEST",
            "unknown event type",
            pack).ok) return pack;

        // now need to create a coupon for a watchable
        manage.makeWatchable(pack, params);
        if (!pack.ok) return pack;

        // set upda the data to write to the watchable
        pack.value = params.data;

        // if start is negative, the 'now' time is delegated to the server to decide
        pack.value.start = pack.value.start < 0 ? new Date().getTime() : pack.value.start;

        // set options from the params TODO
        return dbStore.setWatchable(pack, {
            created: new Date().getTime(),
            key: pack.reader,
            alias: pack.alias || "",
            id: pack.id,
            options: pack.value,
            nextevent: pack.value.start
          })
          .then(result => pack);
      })
      .catch(err =>
        manage.errify(
          false,
          "INTERNAL",
          err
        ));
  };


 /**
   * remvoe a list of bosses
   */
  ns.removeBosses =   (params) => {
    
    // make sure admin is good
    const pack = manage.checkAdmin(params.admin);
    
    // make sure the boss keys are good
    const bosses = params.data && params.data.keys;
    if (!Array.isArray(bosses))bosses = [bosses];
    manage.errify (
      bosses && bosses.length,
      "BAD_REQUEST",
      "no boss keys to delete",
      pack);
    
    // don't care to validate the keys 
    return dbStore.removeBosses (bosses);
        

  };
  
 /**
   * prune any boss keys belonging to a particular account
   */
  ns.pruneBosses =   (params) => {

    // make sure we have auth and admin
    const pack = manage.checkPriv (params); 
    if (!pack.ok) return Promise.resolve (pack);
    pack.code = manage.findCode ("NO_CONTENT");

     
    return dbStore.pruneBosses(

        // this is how to check an account is valid and active
        () => ns.checkAccount(pack),
        
        pack);
        

  };

  // get all the bosses for a given account
  ns.getBosses = (params) => {
    
    // make sure we have auth and admin
    const pack = manage.checkPriv (params); 
    if (!pack.ok) return Promise.resolve (pack);

 
    return dbStore.getBosses(

        // this is how to check an account is valid and active
        () => ns.checkAccount(pack),
        
        pack)
    .then (pack=>{
      // lets delete the authid - nobody needs that
      delete pack.authId;
      if (!pack.ok)return pack;
      
      // need to decode expiry dates for all of these, and we'll sort them too
      pack.coupons = pack.coupons.map (d=>manage.getCouponPack(d ,params )).sort((a,b)=> a.key > b.key ? 1 : (a.key < b.key ? -1 : 0));
      return pack;
      
    });
        
  };
  
  /**
   * delete a profile
   */
  ns.removeProfile =   (params) => {

    // we can use profile for this too 
     // make sure we have auth and admin
    const pack = manage.checkPriv (params); 
    if (!pack.ok) return Promise.resolve (pack);

    // next we need to get the profile
    // this wil use the params.create if tru then it will create both
    // a new profile and a new account (if it doesnt already exit)
    return dbStore.profile ({
      authId:params.authid||params.data.authid, 
      removeProfile:true
    });

  };
  
  /**
   * delete an account
   */
  ns.removeAccount =   (params) => {

    // we can use profile for this too 
     // make sure we have auth and admin
    const pack = manage.checkPriv (params); 
    if (!pack.ok) return Promise.resolve (pack);

    // next we need to get the profile
    // this wil use the params.create if tru then it will create both
    // a new profile and a new account (if it doesnt already exit)
    return dbStore.profile ({
      accountId:params.accountid,
      authId:params.authid||params.data.authid, 
      removeAccount:true
    });

  };



  /**
   * generate a boss key
   */
  ns.generateBoss = (params) => {

    // for now its always boss type, but maybe later...
    params.type = params.type || "boss";
    let pack = manage.makeCoupon(params);

    // since we've just created this, then push in the lock code as the unlock code to decode it
    // locking not fully implemented yet
    params.unlock = params.lock;


    // make sure we have an  admin key and its valid
    if (!manage.checkAdmin(params.admin, pack).ok) return Promise.resolve(pack);

    // now validate the coupon details - we can start again with the pack  
    pack = manage.getCouponPack(pack.code, params);

    // we have to make sure the account is valid and active
    return ns.checkAccount(pack, params.authid)
      .then(function(pack) {
        if (pack.ok) dbStore.registerBoss(pack);
        return pack;
      });

  };

  return ns;
})({});

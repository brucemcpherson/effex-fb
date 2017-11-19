/**
 * various management utils
 */
module.exports = (function (ns) {
  
  ns.settings = {
    mode:"fb",
    days:28,
    intentLifetime: 15000,
    plusALittle:2000,
    slotLimitLifetime:2 * 24 * 60 * 60 * 1000
  };
  
  // import the errors  & secrets
  const errors = require ('./errors');
  const secrets = require ('./private/secrets');
  const coupConst = require ('./coupon');
  const handy = require ('./handy');
  const lucky = require ('./lucky');
  const configs = require ('./configs');
  const coupon_ = new coupConst(secrets.couponAlgos[ns.settings.mode]);

  ns.findCode = (code) => errors[code] || code;

      
   /**
   * register an error if condition is false and ok is not already false
   * @param {boolean|*} test the thing to test - anything truthy
   * @param {number} code the error code to assign
   * @param {string} error the error message
   * @param {object} [pack] the package
   * @param {string} [successCode] that to set it to on success
   * @return {object} the pack
   */
  ns.errify = (test, code, error, pack, successCode) => {

    // allow to start from empty
    pack = pack || ns.goodPack ();

    // if the test is not truthy then its an error
    if (!test) {
      // but only if its ok right now
      if (pack.ok) {
        pack.ok = false;
        pack.code =  ns.findCode (code);
        pack.error = error && error.toString ? error.toString() : error;
      }
    }
    else if (successCode) {
      pack.code = ns.findCode (successCode); 
    }
    return pack;
  };

  ns.checkAuthId = (key, pack) =>
    ns.errify(key, "UNAUTHORIZED", "You need to provide an authid key to create a boss key", pack);
  
  /**
   * check some params have an auth key, an account and also an admin key
   */
  ns.checkPriv = (params , checkAuth) => {
    
    const aid = parseInt(params.accountid,32).toString(32); 
    const authid = (params.data && params.data.authid ) || params.authid;
    const pack = ns.errify(
      aid && authid && params.admin, 
      "BAD_REQUEST",
      'you need an authid, account id, and admin key for this operation', 
      ns.goodPack({
        authId:authid,
        accountId: aid,
      }));
    
    // make sure admin is good
    return ns.checkAdmin(params.admin, pack);

  };
  
  ns.checkAdmin = (key, pack) =>
    ns.errify(key === secrets.adminKeys[ns.settings.mode], "UNAUTHORIZED", "You need to provide a valid admin key for this operation", pack);
  
  ns.makeWatchable = (pack,params) => {

    const seed = seedable_ (pack, "watchable");
    if (!pack.ok) return pack;
    
    // get the keypack as we'll need it if there's an alias
    const keyPack = ns.getCouponPack(pack.reader , params);
    if (!ns.errify (
      keyPack.ok,
      keyPack.code,
      keyPack.error,
      pack
    ).ok) return pack;

    // watchables lifetime is based on the thing they are watching
    // a watchable can be as long the key since the alias 
    // could continue to be reassigned
    var ex = pack.alias ? 
      new Date(keyPack.validtill) : 
      new Date(pack.validtill);

    var vill = Math.ceil(ex.getTime() + ns.settings.plusALittle*(1+Math.random()));

    // keep it in the store for a little extra to allow for any delays
    var life = Math.ceil((vill - new Date().getTime()) / 1000) + 30;
    
    // now generate an id for this watchable
    pack.watchable = coupon_.generate(
      seed.value,
      vill,
      seed.name,
      parseInt(pack.accountId, 32)
    );

    pack.watchableLifetime = life;
    return pack;    
    
  };
  
  const seedable_ = (pack, seedType) => {

   // need to find a seed to generate a coupon
    const seed = secrets.seeds.filter(function(d) {
      return d.type === seedType && d.plan === pack.plan;
    })[0];
    
    // relate succes
    ns.errify(
      seed, "INTERNAL", 
      "couldnt find " + seedType + " seed for plan " + pack.plan, 
      pack
    );
    
    return seed;
  };
  
  ns.makeIntention = (pack) => {
  
    const seed = seedable_ (pack, "intent");
    
    // only update is supported
    ns.errify (
      pack.intention === "update",
      "BAD_REQUEST",
      "intention=update is the only currently supported value",
      pack
    );
    
    return pack.ok ?   
      coupon_.generate(
        seed.value,
        new Date().getTime() + ns.settings.intentLifetime,
        seed.name,
        parseInt(pack.accountId, 32)
      ) : "";
      
  };
  
 /**
   * make a coupon
   * @param {object} params needs .type , .plan , .days | .seconds , accountid
   * @return {object} result pack
   */
  ns.makeCoupon = function(params) {

    // find the seed with the matching type & plan thats an api key
    const seed = secrets.seeds.filter(function(d) {
      return d.type === params.type && d.plan === params.plan;
    })[0];

    // see that parameters are workable
    const pack = ns.errify(seed, "BAD_REQUEST", "no matching plan and type for coupon");
    
    // this is not fully supported everywhere yet
    pack.lockValue = (params.lock || "");

    // if they are, we can go ahead
    if (pack.ok) {
      // default lifetimes
      var nDays = params.days ? parseInt(params.days, 10) : 0;
      var nSeconds = params.seconds ? parseInt(params.seconds, 10) : 0;
      var now = new Date();

      var target = nSeconds ?
        coupon_.addDate(now, "Seconds", nSeconds).getTime() :
        coupon_.addDate(now, "Date", nDays || ns.settings.days).getTime();

      pack.code = coupon_.generate(seed.value + pack.lockValue, target, seed.name + params.accountid, parseInt(params.accountid, 32));

    }

    return pack;

  };
  
  /**
   * generate a pack for a coupon
   * @param {string} code the coupon code
   * @param {object} params the params
   * @return {object} the pack
   */
  ns.getCouponPack = (code, params) => {
    var seed = ns.findSeed(code) || {};
    var pack;
    try {
      var coupon = ns.decodeCoupon(code, seed.value + (params.unlock || "")) || {};
     
      pack = ns.goodPack ({
        key: coupon.coupon,
        validtill: coupon.expiry ? new Date(coupon.expiry).toISOString() : "",
        type: seed.type,
        plan: seed.plan,
        accountId: coupon.extraDays ? coupon.extraDays.toString(32) : "unknown"
      });
      if (!coupon.valid) {
        ns.errify(false, "BAD_REQUEST", "key or alias " + code + " is invalid", pack);
      }
      else if (coupon.expired) {
        ns.errify(false, "UNAUTHORIZED", "key " + code + " has expired", pack);
      }

    }
    catch (err) {
      pack = ns.errify(false, "BAD_REQUEST", "key " + code + " is invalid:"+err);
    }

    return pack;

  };

  /**
   * decode a coupon code
   * @param {string} code the code
   * @return {object} the decoded coupon
   */
  ns.decodeCoupon = function(code, seed) {
    return coupon_.decode(seed, code);
  };
  
  /**
   * generate a good pack to return
   * @param {object} [pack] the starter object
   * @param {*} [value] anything to set in the value property
   * @return {object} updated pack
   */
  ns.goodPack = (pack,value) =>  {
    
    pack = pack || {};
    pack.ok = true;
    pack.code = errors.OK;
    if (!handy.isUndefined(value))pack.value = value;

    return pack;
  };
  
  /**
   * find the seed info for a given code
   */
  ns.findSeed = (code) => {
    return secrets.seeds.filter(function(d) {
      return code ? d.name === code.slice(0, d.name.length) : false;
    })[0];
  };
  
  // find the matching access key
  ns.findAk = (apiSeed, type) => {
    return secrets.seeds.filter(function(d) {
      return type === d.type && apiSeed.plan === d.plan;
    })[0];
  };


  /**
   * this is the packet we'll send
   */
  ns.makeSxpacket = (sx, includeMessage) => {
      
    const makeValuesFromObs_ = (observations) =>
      Object.keys(observations).map(k => observations[k]);

    const now = new Date().getTime();
    
    return {
      id: sx.id,
      alias: sx.alias || "",
      values: makeValuesFromObs_(sx.observations),
      watchable: sx.watchable,
      event: sx.event,
      message: sx.options.message ? (includeMessage ? sx.options.message : "REDACTED:use writer key to see") : "",
      pushId: sx.options.pushid,
      nextevent: sx.nextevent,
      type: sx.options.type,
      uq: sx.options.uq,
      latestObservation:sx.latestObservation,
      now:now
    };
  };

  // make a set of keys
  ns.makeKeys = (bossPack, ak , params) => {
    
    // now we can generate access keys
    const nKeys = params.count ? parseInt(params.count, 10) : 1;
    const nDays = params.days ? parseInt(params.days, 10) : 0;
    const nSeconds = params.seconds ? parseInt(params.seconds, 10) : 0;
    
    const maxTime = new Date(bossPack.validtill).getTime();
    const now = new Date();
    
    let target = nDays ? coupon_.addDate(now, "Date", nDays).getTime() :
        (nSeconds ? coupon_.addDate(now, "Seconds", nSeconds).getTime() : maxTime);
        
    // make sure it doesnt extend beyond end of apikey
    target = Math.min(target, maxTime);
    
    // now the pack is going to talk about the generated keys
    const pack = {
      type: ak.type,
      plan: ak.plan,
      lockValue: (params.lock || ""),
      ok: true,
      validtill: new Date(target).toISOString(),
      keys: [],
      accountId: bossPack.accountId,
      code:errors.OK
    };
    
    // make the keys
    for (let i = 0; i < nKeys; i++) {
      // this makes the keys all a little different
      let aBitRandom = Math.max(now.getTime(), target - lucky.getRandBetween(0, 1000));

      pack.keys.push(
        coupon_.generate(ak.value + pack.lockValue, aBitRandom, ak.name, parseInt(pack.accountId, 32))
      );
    }
    
    return pack;
  };

  
  /**
   * check accessors are going to work
   */
  ns.checkAccessors = (params, pack , type) => {
    if (params[type]) {
      // need to validate these are keys that can read
      pack[type] = params[type].split(",");
      ns.errify(pack[type].every(function(d) {
        var seed = ns.findSeed(d) || {};
        var coupon = ns.decodeCoupon(d, seed.value);
        return coupon.valid && !coupon.expired;
      }), "ACCEPTED", 'warning:' + type + ' keys not validated-they may be locked', pack);
      // it was just a warning
      pack.ok = true;
    }
  };

  ns.checkQuota = (data , pack) => {
    // TODO ratelimiting not yet implemented
    const plan = configs.plans[pack.plan];
    ns.errify (
      plan,
      "INTERNAL",
      "plan not found " + pack.plan,
      pack);
      
    if (!pack.ok) return pack;
    
    ns.errify (
      !data || plan.maxSize >= data.length,
      "QUOTA",
      "exceeded write size of " + plan.maxSize + " for quota",
      pack);
    
    return pack;
  };
  /**
   * prepare lifetime for writing
   */
  ns.prepareLifetime = (pack) => {
    
    // get the plan parameters
    const plan = configs.plans[pack.plan];
    const now = new Date().getTime();
    
    ns.errify(plan, "INTERNAL", "Can't find plan info for plan:" + pack.plan, pack);
      
    // the lifetime will be determined by either
    // - the life of the key creating it
    // - the given time (to the max of the key creating it)
    // - the plan lifetime

    ns.errify (
      plan.maxLifetime >= pack.lifetime || !pack.lifetime,
      "BAD_REQUEST", "Max lifetime for your plan is " + plan.maxLifetime + " you asked for " + pack.lifetime , 
      pack );
    
    // decode the writer key to work out its max lifetime
    const cp = ns.getCouponPack(pack.writer, {});
    ns.errify (cp.ok,"INTERNAL", "Writer key gone invalid - try again", pack );

    pack.lifetime = Math.min (
      pack.lifetime || plan.lifetime,
      Math.floor((new Date(cp.validtill).getTime() - now)/1000),
      plan.maxLifetime
    ); 
    
    // check lifetime is > 0
    ns.errify(
      pack.lifetime > 0, 
      "INTERNAL", 
      "Item would have a lifetime of " + pack.lifetime, 
      pack);

    return pack;    
  };
    
  /**
   * make an alias document key
   * @param {object} pack
   * @return {string} the key
   */
  ns.makeAliasKey = (pack, alias) =>  (pack.reader || pack.writer || pack.updater) + "-" + alias;
  
  /**
   * see if this is an item key
   * @param {string} id the key
   * @param {object} params
   * @return {boolean} it is
   */
   ns.isItemKey = (id, params) => {
    const idPack = ns.getCouponPack(id, params);
    // an expired is ok as well
    return idPack.type === "item" && (idPack.ok || idPack.code === errors["UNAUTHORIZED"]);
   };

  /**
   * make an item key
   * @param {object} pack
   * @return {object} the coupon ob
   */
  ns.makeItemCoupon = (pack) =>  ns.makeCoupon ({
      accountid: pack.accountId,
      plan: pack.plan,
      type: 'item',
      seconds: pack.lifetime
    });

  return ns;

})({});
  
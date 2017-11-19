/**
 * generates/decodes coupoself
 * @namespace Coupon
 */

module.exports =  function (algo) {

  var self = this;
  var crypto = require('crypto');
  var lucky = require('./lucky');

  // changing this will invalidate all previous tokeself 
  var ALGO = algo + "#humpity@trumpity";
  var SIG_SIZE = 3;
  var MAX_PAD = 4;
  
  // a coupon looks like this
  // prefix-pad+sig-expiryhash
  // an extended coupon also contaiself data about number of days to extend from today in the expiryhash

  
   /**
   * generate a coupon code with a particular expiry date
   * @param {string} salt your private key
   * @param {number} expiry timestamp for when its supposed to expire
   * @param {string} planName the plan to generate a coupon for
   * @param {number} [extendDays=0]
   * @return {string} a coupon code
   */
  self.generate = function (salt, expiry,prefix,extendDays) {
    if (typeof expiry !== 'number') {
      throw 'date should be a time stamp';
    }

    extendDays = extendDays || 0;   
    
    if (typeof extendDays !== 'number') {
      throw 'extenddays should be a number';
    }
    
    if (typeof salt !== 'string') {
      throw 'salt should be a string';
    }
    if (typeof prefix  !== 'string') {
      throw 'prefix should be a string';
    }
    if (!expiry)throw 'need expiry to generate coupon';
    
    var result = getCode_ ( salt, prefix,  expiry.toString(32), extendDays, false);

    return result.coupon;
  };
  

  /**
   * generate a coupon code with an expiry date of n days from now
   * @param {string} salt your private key
   * @param {number} nMonths expiry n months from now
   * @param {string} prefix the prefix
   * @param {number} [extendDays=0]
   * @return {string} coupon code
   */
  self.generateMonths = function (salt, nMonths , prefix,extendDays) {
    return self.generate (salt, addDate_(new Date() , "Month" , nMonths).getTime()  ,prefix,extendDays);
  };
  
  /**
   * generate a coupon code with an expiry date of n days from now
   * @param {string} salt your private key
   * @param {number} nDays expiry n days from now
   * @param {string} prefix the prefix
   * @param {number} [extendDays=0]
   * @param {number} [maxTimestamp] the maximum date the end can be
   * @return {string} coupon code
   */
  self.generateDays = function (salt, nDays , prefix,extendDays, maxStamp) {
    var target = addDate_(new Date() , "Date" , nDays).getTime();
    if (maxStamp) {
      target = Math.min (target , maxStamp);
    }
    return self.generate (salt, target  ,prefix,extendDays);
  };
  
  /**
   * decode a coupon
   * @param {string} salt your private key
   * @param {string} coupon code
   * @return {object} the result
   */
  self.decode = function (salt, coupon) {

    var matches = (coupon || "").split("-");
    var valid,c,padding,sig;
    try {
      // remove the padding
      padding = matches[1].slice (0,matches[1].length - SIG_SIZE);
      sig = matches[1].slice (padding.length);
      c = getCode_ (salt, matches[0], sig + matches[2], 0 , true, padding);
      valid = coupon && c.coupon === coupon;
    }
    catch (err) {
      valid = false;
      c = {};
    }
    return {
      expiry:valid ? c.expiry: 0,
      valid:valid,
      prefix:matches[0],
      coupon:coupon,
      expired:!valid || c.expiry <= new Date().getTime(),
      extraDays:c.extraDays,
      extendedExpiry:c.extendedExpiry
    };
  };

  self.addDate =  function(when, period, howMany) {
    return addDate_ (when,period, howMany);
  };  
  /**
   * need a repeatable seed for the random function
   * this generates a hash of the string
   * @param {string} str
   * @return {number} the seed
   */
  function getPepper_ (str) {
    var m = 0;
    return self.digest (str+ALGO)
    .split("")
    .reduce (function (p,c) {
      return p + (c.charCodeAt(0)*Math.pow(.1,m++));
    },7);
    
  }
  /**
   * i need to be able to generate repeatable random numbers
   * @param {string} salt the private key
   * @param {string} str the string to shuffle
   */
  function getSeq_ (salt, str) {
    
    // save the current seed
    var seed = Math.seed;
    
    // the initial seed - if its the value, we get repeated random numbers
    Math.seed = getPepper_(salt);

    // generate a repeatable array based on the string
    var muffle = str.split("")
    .map(function(d,i) {
      return i;
    });
    
    // shuffle
    muffle.forEach(function(d,i,a) {
      var dx = Math.round(seededRandom ()*(a.length-1)) ;
      var t = a[dx];
      a[dx] = a[i];
      a[i] = t;
    });
    
    // restore
    Math.seed = seed;
    
    // return a shuffle array
    return muffle;
    

    // thanks to http://indiegamr.com/generate-repeatable-random-numbers-in-js/
    /// I have no idea why this works, but it does
    function seededRandom(max, min) {
      max = max || 1;
      min = min || 0;
      
      Math.seed = (Math.seed * 9301 + 49297) % 233280;
      var rnd = Math.seed / 233280;
      
      return min + rnd * (max - min);
    }
    
  }
  
  /**
   * given an array or sequence, scramble or uselfcramble
   * @param {[number]} seq the sequence to scramble into
   * @param {string} expiry32 the expiry date as string32
   * @param {boolean} uselfcrambling whether we're uselfcrambling
   * @return {string} the scrambled/uselfcrambled expiry32
   */
  function scramble_ (seq, expiry32, uselfcrambling) {
   
    if (!seq || seq.length !== expiry32.length) {
      throw 'coupon sequencing model is invalid'+seq.join(",");
    }
    
    return expiry32
    .split("")
    .map(function (d,i,a) {
      return uselfcrambling ? a[seq.indexOf(i)] : a[seq[i]];
    })
    .join("");
    
  }
  
  self.sign = function (value, secret) {
    return sign_ (value, secret);
  };
  
  function sign_ (value, secret) {
    var hmac = crypto.createHmac('sha256', secret);
    hmac.update(value);
    return (hmac.digest ('base64'));
  } 
      
  /**
   * get a coupon
   * @param {string} salt your private key
   * @param {string} prefix your token prefix
   * @param {string} target the expiry date as string32
   * @param {number} extendDays if not 0, will make a token that has an extended number of days from the time its decoded
   * @param {boolean} [decoding=false] whether we're decoding from an existing coupon
   * @param {string} padding any predefined padding
   * @return {object} the result
   */
  function getCode_ ( salt, prefix, target, extendDays , decoding,padding) {
    

    if (typeof salt !== 'string' || salt.length < 6) {
      throw 'salt value must be a string of at least 6 characters';
    }
    
    // used to determine the length of a timestamp
    var t32 = new Date().getTime();
    var tsLen = t32.toString(32).length;
    
    // ignore extenddays if decoding
    extendDays = decoding ? 0 : extendDays;
    
    // must have both a prefix and a target (the expiry date shuffle)
    if (prefix && target && target.length >= tsLen) {
      
      // "-" not allowed in prefix
      prefix = prefix.replace(/-/g,"_");
    
      // extend the target by extend days
      if (extendDays) {
        target += extendDays.toString(32);
      }
      
      // simulate a sig for decoding
      var t = decoding ? target : nChars_ (SIG_SIZE , "x" ) + target;
      
      
      // the shuffle sequence for this kind of token
      var seq = getSeq_ ( prefix+salt , t );
      
      // scramble using the shuffle sequence
      t = decoding ? scramble_ (seq , target, true) : t;
      var e32 = t.slice (SIG_SIZE);
      
      // if this is an extended token slice of the expiry and the extended parts
      var expiry32 = e32.slice (0,tsLen);
      var ex32 = e32.slice (tsLen);
      
      // digest the coupon parameters and salt
      var z = self.digest(prefix,e32,salt);
      // sign it with itself

      var c = sign_(prefix+e32, salt+z).toString('base64EncodeWebSafe');
      // digest the signed result
      var x = self.digest (c);
      
      // convert expiry back to a timestamp
      var expiry = parseInt(expiry32,32);
      
      // use part of the expiry time to get a slice of the signed digest
      var start = expiry % (x.length-SIG_SIZE-1);
      
      // this is the validation code for the expiry time
      var sig = x.slice(start,start+SIG_SIZE).toLowerCase();
      
      // calculate extra days
      var extraDays = ex32 ? parseInt(ex32,32) : 0;
    
      // scramble it all up
      var scramble = scramble_ (seq, sig + expiry32 + ex32,false);
      
      // add random padding
      padding = decoding ? padding : lucky.getString({
        size:0,
        maxSize:MAX_PAD
      });
      
      var paddedSig = padding+scramble.slice(0,SIG_SIZE);
      
      return {
        coupon:prefix+"-" + paddedSig +"-"+scramble.slice (SIG_SIZE),
        expiry:expiry,
        ex32:expiry32,
        extraDays:extraDays,
        extendedExpiry:extraDays ? addDate_(new Date(),"Date", extraDays).getTime() : 0
      };
    }
    else {
      return {};
    }
  }
  
  
  function sha1_ (thing) {
    var sha = crypto.createHash("sha1");
    sha.update(thing);
    // dont want chars like this to come up in a key
    return sha.digest("base64").replace(/\//g,"_").replace(/\+/g,"$");
  }
  
  
  self.digest = function () {
    // conver args to an array and digest them
    var stuff = Array.prototype.slice.call(arguments)
    .map(function (d) {
        return (Object(d) === d)  ? JSON.stringify(d) : (isUndefined_(d) ? 'undefined' : d.toString());
    })
    .join("-");
    
    // digest it
    return sha1_ (stuff);

  }



  function isUndefined_ (o) {
    return typeof o === typeof undefined;
  }
  
  function addDate_ (when, period , howMany) {
    var nd = new Date(when);
    nd['set'+period] (when['get'+period]() + howMany);
    return nd;
  }
  
  function nChars_ (howMany , theChar) {
    return new Array(howMany+1).slice().join(theChar || " ");
  }

};


    

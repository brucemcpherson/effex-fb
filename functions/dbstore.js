/**
 * firestore functions abstracted
 * TODO set error 423 for Error: too much contention on these datastore entities. please try again
 */
module.exports = (function(ns) {

  let db, fb;
  let functions;

  const manage = require('./manage');
  const handy = require('./handy');


  // needs to be called at beginning of app somewhere
  ns.init = () => {

    // pull in firebase
    const admin = require('firebase-admin');
    functions = require('firebase-functions');

    // initialize
    admin.initializeApp(functions.config().firebase);
    db = admin.firestore();
    fb = admin.database();
    return ns;
  };


  /**
   * ping
   * this does a request to a special
   * key on the DB and returns whatevers there
   * used to check we have connectivity
   * @return {Promise} the response
   */
  ns.ping = () => {
    return fetch_("services", "ping");
  };

  /**
   * getBoss
   * @param {string} bossKey the boss to fetch
   * @return {Promise} the response
   */
  ns.getBoss = (bossKey) =>
    fetch_("bosses", bossKey);

  /**
   * getAlias
   * @param {string} alias the aliase
   * @param {string} accessKey to assign it to
   * @return {Promise} the response
   */
  ns.getAlias = (alias, accessKey) =>
    fetch_("aliases", aliasKey_(alias, accessKey));

  // fixes up watchables to point to an item
  // if an alias changes
  ns.setAlias = (pack, keyInfo) => {

    return db.runTransaction(t => {

      // one for each key/alias combination
      return Promise.all(keyInfo.map(d => {
          // for every key, get the alias
          return pack.alias ? ns.getAlias(pack.alias, d.key) : "";
        }))

        .then(matchedAliases => {

          // they should probably all point to the same item, but just in case they dont
          // we'll get them all
          return Promise.all((matchedAliases || []).map(d => {

            // if there's a match, we have to get all the watchables where
            // this key/alias combination is being used
            // this is going to change all all watchers for this item
            // might be wrong if there are different aliases in operation
            // for differnt keys
            // TODO figure out a better way
            return d && d.ok ? ns.queryWatchables(d.value.id, undefined, pack.alias) : null;

          }));
        })

        // we have all the watchables, need to update them
        .then(docs => {

          return Promise.all(
            (docs || []).reduce((p, c) => {
              // for each matching item
              (c || []).forEach(d => {
                const data = d && d.exists && d.data();
                if (data) {

                  // finally set the alias in the watchable
                  if (!p.some(e => e.watchable === d.id)) {
                    data.meta.modified = new Date().getTime();
                    data.id = pack.id;
                    data.expires = pack.lifetime * 1000 + data.meta.modified;
                    p.push({ watchable: d.id, data: data });
                  }
                }
              });
              return p;
            }, [])
            .map(d => {
              return t.update(watchableRef_(d.watchable), d.data);
            }));
        })

        .then(results => {
          return Promise.all(keyInfo.map(d => {
            t.set(aliasRef_(pack.alias, d.key), {
              id: pack.id,
              expires: d.expires
            });
          }));
        })

        .then(results => pack)
        .catch(err => Promise.reject(manage.errify(false, "INTERNAL", err, pack)));

    });
  };


  /**
   * getAccount
   * @param {string} accountId the account to fetch
   * @return {Promise} the response
   */
  ns.getAccount = (accountId) =>
    fetch_("accounts", accountId);

  /**
   * getItem
   * @param {string} id the item to fetch
   * @return {Promise} the response
   */
  ns.getItem = (id) =>
    fetch_("items", id);

  /**
   * register an account
   */
  ns.setAccount = (pack) => set_("accounts", pack.accountId, {
    active: pack.active,
    authId: pack.authId,
    modified: new Date().getTime(),
    expires: 0
  });
  /**
   * register a boss key
   */
  ns.registerBoss = (pack) => set_("bosses", pack.key, {
    accountId: pack.accountId,
    expires: new Date(pack.validtill).getTime(),
    modified: new Date().getTime()
  });

  /**
   * write an item 
   */
  ns.setItem = (pack, data) => set_("items", pack.id, {
    data: data,
    meta: {
      writer: pack.writer,
      readers: pack.readers || [],
      updaters: pack.updaters || [],
      session: pack.session,
      modified: new Date().getTime()
    },
    expires: new Date().getTime() + pack.lifetime * 1000
  });

  /**
   * get from eventlog
   * @param {string} watchableId
   */
  ns.readWatchable = (watchableId) => {

    return watchableRef_(watchableId)
      .get()
      .then(doc => pack_(doc))
      .catch(err => Promise.resolve(manage.errify(false, "NOT_FOUND", err)));

  };

  /**
   * get from eventlog
   * @param {string} watchableId
   */
  ns.readEventlog = (watchableId) => {

    return eventlogRef_(watchableId)
      .get()
      .then(doc => pack_(doc))
      .catch(err => Promise.resolve(manage.errify(false, "NOT_FOUND", err)));


  };


  /**
   * update eventlog
   */
  ns.logEvents = (itemId, eventType, modified) => {


    return db.runTransaction(t => {

        // get all the watchables that reference this
        return ns.queryWatchables(itemId, eventType)
          .then(docs => {

            //these are the watchables affected by this update
            const obs = docs.map(d => {

                return {
                  watchable: d.id,
                  data: d.exists ? d.data() : null
                };
              })
              .map(d => {

                if (!d.data) return null;
                let ob = d.data;
                ob.latestObservation = modified,
                  ob.observations[ob.latestObservation.toString()] = ob.latestObservation;
                t.set(watchableRef_(d.watchable), ob);

                return {
                  item: d,
                  ob: ob
                };
              })
              .filter(d => d);
            return Promise.resolve(manage.goodPack({ obs: obs }));
          });
      })
      .catch(err => {
        return manage.errify(false, "INTERNAL", err);
      });


  };

  /**
   * remove something to the uq push notification store
   */
  ns.getAllUqs = () => getDatabase_("uqs");

  /**
   * remove something to the uq push notification store
   */
  ns.removeUq = (uq) => removeDatabase_("uqs", uq);

  /**
   * write something to the uq push notification store
   * note that for now this writes not to firestore, but to a 
   * realtime database
   * as there is a protobuf problem with developing on node for client access to forestore
   */
  ns.setUq = (uq, ob) => setDatabase_("uqs", uq, ob);

  /**
   * remove a watchale
   * @params {string} wpack watchable pack
   */
  ns.removeWatchable = (wpack) => {

    return db.runTransaction(t => {

      // get existing watchableId
      return t.get(watchableRef_(wpack.key))
        .then(doc => {
          const pack = pack_(doc);
          manage.errify(
            pack.ok, pack.code, pack.error, wpack, "NO_CONTENT");
          if (!pack.ok) return Promise.reject(wpack);
          t.delete(watchableRef_(wpack.key));
          return wpack;
        });

    });



  };
  /**
   * write a watchable 
   */
  ns.setWatchable = (pack, data) => {
    // all the stuff to write
    const ob = handy.clone(data);
    const now = new Date().getTime();
    // used for managing
    ob.meta = {
      session: pack.session,
      modified: now,
      aliasKey: pack.alias ? aliasKey_(pack.alias, pack.reader) : ""
    };
    // used for searching
    ob.event = pack.event;
    ob.id = pack.id;
    ob.observations = {};
    ob.latestObservation = 0;
    // used for expiring
    ob.expires = now + pack.watchableLifetime * 1000;
    return set_("watchables", pack.watchable, ob);
  };

  /**
   * get the rate limit manager
   */
  ns.getSlotLimit = (accountId) => fetch_("slotlimits", accountId);

  ns.setSlotLimit = (accountId, ob) => set_("slotlimits", accountId, ob);

  /**
   * gets a user profile
   * or potentially creates one
   * it will also create an account if necessary
   */
  ns.profile = (options) => {

    // add the new user to the profile
    const now = new Date().getTime();
    let addAc, addPr, remAc, remPr;
    
    return db.runTransaction(t => {

      // first get the current id there is one
      return t.get(profileRef_(options.authId))
        .then(doc => {
          const pack = pack_(doc);
          pack.newProfile = false;
          const missing = pack.code === manage.findCode("NOT_FOUND");
          addAc = !missing && options.createAccount;
          addPr = missing && options.createProfile;
          remAc = options.removeAccount;
          remPr = options.removeProfile;
          
          // this is bad as we havent a profile, and we cant add it.
          if (missing && !addPr) return pack;
          if (missing && remAc) return pack;
          if (missing && remPr) return pack;
          if (missing)pack.ok = true;
          if (!pack.ok) return pack;
          
          // can create a profile or account using the same code
          if (addPr) {
            pack.value = {
              created: now,
              modified: now,
              active: true,
              expires: 0,
              planId:options.planId || manage.getDefaultPlan(),
              accounts: {}
            };
            
          }

          // check that all is ok with the struct of the profile for adding accounts
          if (addPr || addAc ) {
            manage.errify(typeof pack.value.accounts === "object", "INTERNAL", "accounts list missing from profile", pack);
            if (!pack.ok) return pack;

            return t.get(countersRef_())
              .then(countDoc => {
                const p = pack_(countDoc);
                pack.ok = true;
                manage.errify(p.ok, p.code, p.error, pack);
                if (!pack.ok) return pack;

                // need to get the next counter
                manage.errify(!isNaN(p.value.accounts), "INTERNAL", "bad accounts counter", pack);
                if (!pack.ok) return pack;

                // add an account
                pack.accountId = (p.value.accounts + 1).toString(32);
                pack.value.accounts[pack.accountId] = {
                  planId: options.planId || pack.value.planId,
                  active: true,
                  created: now,
                  modified: now,
                  expires: 0
                };

                // need to update the counter
                t.update(countersRef_(), { accounts: p.value.accounts + 1 }, { merge: true });
                
                // set the created fla id needed
                pack.newProfile = addPr;
                
                return pack;
              });
          }
          else if (remAc) {
            // find the account
            pack.accountId = options.accountId;
            manage.errify (
              pack.value && pack.value.accounts && pack.value.accounts[pack.accountId],
              "NOT_FOUND",
              "account " + pack.accountId + " not found",
              pack,
              "NO_CONTENT"
            );
            if (pack.ok) {
              delete pack.value.accounts[pack.accountId];
            }
            return pack;
          }
          else {
            return pack;
          }
        })
        .then(pack => {
          if (!pack.ok) return pack;
          

          if (addPr || addAc || remAc) {
            // set the updated profiles
            t.set(profileRef_(options.authId), pack.value);
            return pack;
          }
          
          else if (remPr) {
            // remove the profile altogether
            t.delete(profileRef_(options.authId));
            return manage.errify (pack.ok , pack.code , pack.error ,null, "NO_CONTENT");
            
          }

          return pack;

        })
        .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));
    });
  };
  
  /**
   * query profiles
   */
  ns.queryAccounts = (accountId) => {
    
    const now = new Date().getTime();
    const query = db.collection("profiles")
      .where ("accounts."+accountId+".active", "==", true)
      .where ("active","==",true);
      
    return query.get()
      .then(result => result.docs.filter((d) => {
        const dat = d.exists && d.data();
        const ob = dat && dat.accounts[accountId];
        return dat && ob && (!ob.expires || ob.expires > now) && ob.active && (dat.expires > now || !dat.expires) && dat.active;
      }))
      .then (docs=> { 
        const rs = docs.map(d => {
          return { authid:d.id, account:d.data().accounts[accountId]};
        });
        return manage.goodPack (undefined, rs);
      })
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));
      
      
  };
  
  /**
   * query bosses for this
   */
  ns.queryBosses = (accountId) => {

    const now = new Date().getTime();
    const query = db.collection("bosses")
      .where('accountId', '==', accountId);


    return query.get()
      .then(result => result.docs.filter((d) => d.data().expires > now));


  };

  /**
   * query watchables for this
   */
  ns.queryWatchables = (itemId, eventType, alias) => {

    const now = new Date().getTime();
    const query = db.collection("watchables").where('id', '==', itemId);
    if (eventType) query.where('event', '==', eventType);
    if (alias) query.where('alias', '==', alias);
    // filter out expires
    // shouldnt be any.many of these so not worth creating a custom key
    return query.get()
      .then(result => result.docs.filter((d) => d.data().expires > now));

  };
  const pack_ = (doc) => {

    // set up success message
    const pack = manage.errify(
      doc.exists,
      "NOT_FOUND",
      'document ' + doc.ref.parent.id + "/" + doc.ref.id + ' missing',
      manage.goodPack({}, doc.exists ? doc.data() : undefined));

    // now we need to see if its expired
    const exp = pack && pack.value ? new Date(pack.value.expires).toString() : 'unknown';
    manage.errify(!pack.value || !pack.value.expires || pack.value.expires > new Date().getTime(),
      "EXPIRED",
      'document ' + doc.ref.parent.id + "/" + doc.ref.id + ' expired at ' + exp,
      pack);

    return pack;
  };

  // just some shortcuts
  const aliasKey_ = (alias, key) => {
    return handy.checkString(alias) + "-" + handy.checkString(key);
  };

  const bossRef_ = (key) => db.collection("bosses").doc(handy.checkString(key));


  const countersRef_ = () => db.collection("services").doc("counters");
  const profileRef_ = (authId) => db.collection("profiles").doc(handy.checkString(authId));

  const aliasRef_ = (alias, key) =>
    db.collection("aliases")
    .doc(aliasKey_(alias, key));

  const intentRef_ = (key) =>
    db.collection("intentions")
    .doc(handy.checkString(key));

  const eventlogRef_ = (key) =>
    db.collection("eventlogs")
    .doc(handy.checkString(key));

  const watchableRef_ = (key) =>
    db.collection("watchables")
    .doc(handy.checkString(key));

  const fetch_ = (colName, docName) =>
    db.collection(handy.checkString(colName))
    .doc(handy.checkString(docName))
    .get()
    .then(doc => pack_(doc))
    .catch(err => Promise.resolve(manage.errify(false, "NOT_FOUND", err)));

  const set_ = (colName, docName, data) =>
    db.collection(handy.checkString(colName))
    .doc(handy.checkString(docName))
    .set(data)
    .then(result => manage.errify(true))
    .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));

  const remove_ = (colName, docName) =>
    db.collection(handy.checkString(colName))
    .doc(handy.checkString(docName))
    .delete()
    .then(result => manage.errify(true))
    .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));

  const setDatabase_ = (colName, docName, data) => {

    return fb.ref(handy.checkString(colName) + "/" + handy.checkString(docName))
      .set(data)
      .then(result => manage.errify(true))
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));
  };

  const getDatabase_ = (colName, docName) => {

    return fb.ref(handy.checkString(colName) + (docName ? "/" + handy.checkString(docName) : ""))
      .once('value')
      .then(snapshot => manage.errify(snapshot.val(), "NOT_FOUND", "no uqs", manage.goodPack({ value: snapshot.val() })))
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));
  };

  const removeDatabase_ = (colName, docName) => {

    return fb.ref(handy.checkString(colName) + "/" + handy.checkString(docName))
      .remove()
      .then(result => manage.errify(true))
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));
  };


  function removeExpired_(collection, now) {

    // this one is firebase
    if (collection === "uqs") {
      return ns.getAllUqs()
        .then(pack => {
          // its worse than not found
          if (!pack.ok && pack.code !== manage.findCode("NOT_FOUND")) return pack;

          // there arent any
          if (!pack.ok) {
            pack.writeResults = [],
              pack.ok = true;
            return pack;
          }

          // there may be some
          const keys = Object.keys(pack.value);
          const toRemove = keys.filter(k => {
            const d = pack.value[k];
            const expires = typeof d === "object" ? d.expires : d;
            return expires && expires < now;
          });

          return Promise.all(toRemove.map(k => ns.removeUq(k)))
            .then(results => {
              pack.writeResults = toRemove;
              return pack;
            });


        });
    }

    // these are firestore
    else {
      const batch = db.batch();
      const query = db.collection(collection)
        .where('expires', '>', 0)
        .where('expires', '<', now);

      return query.get()
        .then(result => {
          if (!result.size) return Promise.resolve(null);
          // there are some so delete them
          result.docs.forEach(d => batch.delete(d.ref));
          return batch.commit();
        });
    }
  }

  /**
   * get bosses
   */
  ns.getBosses = (checkAccount, pack) => {

    // can be done in parallel
    const pAccount = checkAccount()
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));

    const pQuery = ns.queryBosses(pack.accountId)
      .then(docs => manage.goodPack(undefined, docs
        .map(d => d && d.exists ? d.ref : null)
        .filter(d => d)))
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));


    // query which bosses there are
    return Promise.all([pAccount, pQuery])

      .then(result => {
        const apack = result[0];
        const qpack = result[1];

        // just give up on any errors

        if (!apack.ok) return apack;
        if (!qpack.ok) {
          delete qpack.value;
          return qpack;
        }

        apack.coupons = qpack.value.map(d => d.ref.id);
        return apack;

      })
      .catch(err => {
        return manage.errify(false, "INTERNAL", err, pack);
      });

  };

  /**
   * remove bosses
   */
  ns.removeBosses = (keys) => {

    // do it in batch 
    const batch = db.batch();

    // now remove then
    // note the pre-condition exists:true
    keys.forEach(d => batch.delete(bossRef_(d), { exists: true }));

    // now committing
    return batch.commit()
      .then(result => {
        return manage.errify(
          true,
          "INTERNAL",
          "scotty",
          manage.goodPack({ keys: keys }),
          "NO_CONTENT"
        );
      })
      .catch(err => {
        // a missing item will have an error like "no entity to update"
        // clean up such an error here
        const miss = err.toString().indexOf("no entity to update");
        const match = err.toString().match(/name:\s+"([\w-_\$]+)/);
        const key = match && match[1];

        return Promise.resolve(manage.errify(
          false,
          miss === -1 ? "INTERNAL" : "NOT_FOUND",
          "failed to delete boss keys " + (key ? key : ""),
          manage.goodPack({
            keys: keys
          })));

      });


  };
  

  /**
   * prune bosses
   */
  ns.pruneBosses = (checkAccount, pack) => {

    // can be done in parallel
    const pAccount = checkAccount()
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));

    const pQuery = ns.queryBosses(pack.accountId)
      .then(docs => manage.goodPack(undefined, docs
        .map(d => d && d.exists ? d.ref : null)
        .filter(d => d)))
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));

    const batch = db.batch();

    // query which bosses there are
    return Promise.all([pAccount, pQuery])

      .then(result => {
        const apack = result[0];
        const qpack = result[1];

        // just give up
        if (!qpack.ok) {
          delete qpack.value;
          return qpack;
        }

        // the account can be missing, and we'd still prune
        if (!(apack.ok || manage.findCode("NOT_FOUND") === apack.code)) return apack;

        // now remove then
        qpack.value.forEach(d => {

          try {
            batch.delete(bossRef_(d.ref.id));
          }
          catch (err) {
            manage.errify(
              false,
              "INTERNAL",
              err,
              apack
            );
          }
        });

        // now committing
        return batch.commit()
          .then(result => {
            return apack;
          })
          .catch(err => {
            return manage.errify(false, "INTERNAL", err, apack);
          });

      });


  };

  /**
   * remove an account
   */
  ns.removeAccount = (pack) => remove_("accounts", pack.accountId);

  /**
   * remove expired
   */
  ns.removeExpired = (collections) => {

    // expired from 2 minutes ago
    // to give operations in progress some breathing space
    const now = new Date() - 1000 * 2 * 60;

    // TODO - the uqs Store
    // do it a collection at a time
    return Promise.all(
        ["items", "aliases", "accounts", "bosses", "services", "intentions", "watchables", "eventlogs", "slotlimits", "uqs"]
        .map(d => removeExpired_(d, now))
      )
      .then(result => {
        return manage.errify(
          true,
          "INTERNAL",
          "batch delete", {
            removed: result.reduce((p, c) => {
              if (c && c.writeResults) p += c.writeResults.length;
              return p;
            }, 0)
          },
          "NO_CONTENT");

      })
      .catch(err => Promise.resolve(manage.errify, false, "INTERNAL", err));

  };

  /**
   * reading
   * needs to be done in transaction
   * this will deal with aliases/getting the item etc.
   * but functions passed through will be used to leverage closure
   * from the caller
   * @param {function} checkAccount will see that account is valid and active
   * @param {function} checkIfAlias will see if this item is an alias item key
   * @param {function} resolveAlias if an alias will update the pack with the alias info and validate it
   * @param {function} checkAllowedToRead if allowed to read
   * @param {function} makeIntention how to make an intention key
   * @return {Promise}
   */
  ns.readItem = (checkAccount, checkIfAlias, resolveAlias, checkAllowedToRead, makeIntention) => {

    const pAccount = checkAccount()
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));

    // the transaction
    const pTransaction = db.runTransaction(t =>

        // how to deal with aliases is passed over
        // and returns {pack:the original pack , itemPack:if it was a real item}
        checkIfAlias()

        // if itemPack is not set then we have a potential alias
        // returns {pack:the original pack,aliasDocPack:the pack from an alias get}
        .then(result => shrinkAliasRef_(t, result, "reader"))

        // sort out all that to a single pack
        .then(result => shrinkAlias_(result, resolveAlias))

        // get the current item
        // returns {pack:pack , item:item result pack,doc: the doc}
        .then(pack => shrinkItemGet_(t, pack))

        // finally the read results
        .then(result => {

          // make sure we have everything
          const pack = shrinkCheckGet_(result);
          const meta = result.item && result.item.value && result.item.value.meta;
          // make sure we have everything
          if (pack.ok) {

            // check we're allowed to read it
            manage.errify(
              checkAllowedToRead(meta.writer, (meta.readers || []).concat(meta.updaters || [])),
              "UNAUTHORIZED",
              "that access key is not allowed to read this item",
              pack
            );
          }

          pack.session = meta && meta.session;
          pack.modified = meta && meta.modified;

          // only show the value if all was good
          if (pack.ok) {

            pack.value = handy.tryParse(result.item.value.data);
            // if the key is the writer, then we can expose the the updaters/readers
            if (pack.reader === meta.writer) {
              pack.updaters = meta.updaters || [];
              pack.readers = meta.updaters || [];
            }


          }

          // now time to make an intention
          if (!pack.ok || !pack.intention) return pack;

          const intentionPack = makeIntention(pack);

          manage.errify(
            intentionPack.ok,
            intentionPack.code,
            intentionPack.error,
            pack);
          if (!pack.ok) return Promise.reject(pack);

          // now see if there's already an intention out on this item then grab it
          return shrinkIntentionGet_(t, pack)
            .then(iResult => {
              manage.errify(!iResult.intention.ok,
                "LOCKED",
                "item is already locked by another key",
                pack
              );
              if (pack.ok) {
                // we can go ahead and make one
                return shrinkIntentionSet_(t, intentionPack, pack);
              }
              else {
                pack.intentExpires = Math.ceil(
                  (new Date(iResult.intention.value.expires) - new Date().getTime()) / 1000);
                return Promise.reject(pack);
              }
            });

        })
      )
      .catch(pack => pack);

    // the account check and read happened in parallel
    return Promise.all([
        pTransaction,
        pAccount
      ])
      .then(results => results[1].ok ? results[0] : results[1]);
  };

  const shrinkAlias_ = (result, resolveAlias) => {
    // the base pack is either the original or an itemPack
    if (result.itemPack) return result.itemPack;

    // if we dont have an alias pack then were in troubke
    // so return the original pack
    if (!result.aliasDocPack) return result.pack;

    // otherwise we need to sort out the alias pack
    return resolveAlias(result.aliasDocPack, result.pack);
  };

  const shrinkIntentionSet_ = (t, intentionPack, pack) => {
    const expire = new Date(intentionPack.validtill).getTime();
    const now = new Date().getTime();

    const ob = {
      updater: pack.reader,
      intent: intentionPack.key,
      expires: expire,
      intention: pack.intention
    };

    t.set(intentRef_(pack.id), ob);

    pack.intent = intentionPack.key;
    pack.intentExpires = Math.ceil((expire - now) / 1000);
    return Promise.resolve(pack);

  };

  const shrinkAliasRef_ = (t, result, keyProp) => {
    return result.itemPack ?
      result :
      t.get(aliasRef_(result.pack.id, result.pack[keyProp]))
      .then(doc => {
        return {
          aliasDocPack: pack_(doc),
          pack: result.pack
        };
      });
  };


  const shrinkItemGet_ = (t, pack) => {

    if (!pack.ok) return { pack: pack };

    return t.get(db.collection("items").doc(pack.id))
      .then(doc => {
        return {
          item: pack_(doc),
          doc: doc,
          pack: pack
        };
      });
  };

  const shrinkIntentionGet_ = (t, pack) => {

    if (!pack.ok) return Promise.resolve({ pack: pack });

    return t.get(intentRef_(pack.id))
      .then(doc => {

        const intn = pack_(doc);
        return {
          intention: intn,
          doc: doc,
          pack: pack
        };
      });
  };

  const shrinkCheckGet_ = (result) => manage.errify(!result.item || result.item.ok,
    (result.item && result.item.code) || "INTERNAL",
    (result.item && result.item.error) || "Error in transaction read",
    result.pack
  );

  const shrinkCheckIntent_ = (t, pack) => {

    return shrinkIntentionGet_(t, pack)
      .then(iResult => {

        if (iResult.intention && iResult.intention.ok) {
          // we have an intent - if this is not a match
          // then there's a lock
          const iv = iResult.intention.value;
          manage.errify(
            pack.intent,
            "LOCKED",
            "Update rejected as no intent key provided for locked item",
            pack
          );

          manage.errify(
            pack.intent === iv.intent,
            "LOCKED",
            "item is already locked by a another intent ",
            pack
          );

          manage.errify(
            "update" === iv.intention,
            "BAD_REQUEST",
            "intent " + iv.intent + " not qualified for update",
            pack
          );

          manage.errify(
            pack.updater === iv.updater,
            "LOCKED",
            "intent not assigned to this updater " + pack.updater,
            pack
          );
          pack.intentUsed = pack.ok;
        }
        return pack;
      })
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err, pack)));
  };

  /**
   * removing intent is quite complex
   * as it needs to be done in transaction
   * but functions passed through will be used to leverage closure
   * from the caller
   * @param {string} data the data to write
   * @param {function} checkAccount is to see whether the account is active
   * @param {object} pack with all the params needed
   * @return {Promise}
   */
  ns.removeIntent = (checkAccount, pack) => {

    // check account in parallel
    const pAccount = checkAccount()
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));

    return db.runTransaction(t => {

        return shrinkCheckIntent_(t, pack)
          .then(pack => {

            return pAccount
              .then(accountPack => accountPack.ok ? pack : accountPack)
              .then(pack => {
                if (pack.ok && pack.intentUsed) {
                  t.delete(intentRef_(pack.id));
                  // set the correct code for deletion
                  manage.errify(true, "INTERNAL", "scotty", pack, "NO_CONTENT");
                }
                else if (pack.ok) {
                  manage.errify(false, "NOT_FOUND", "intent " + pack.intent + " not found", pack);
                }
                return pack.ok ? pack : Promise.reject(pack);
              });
          });
      })
      .catch(pack => pack);
  };

  /**
   * updating is quite complex
   * as it needs to be done in transaction
   * this will deal with aliases/getting the item etc.
   * but functions passed through will be used to leverage closure
   * from the caller
   * @param {string} data the data to write
   * @param {function} checkAccount is to see whether the account is active
   * @param {function} checkIfAlias will see if this item is an alias item key
   * @param {function} resolveAlias if an alias will update the pack with the alias info and validate it
   * @param {function} checkAllowedToUpdate will make sure an access key is allowed to update
   * @return {Promise}
   */
  ns.updateItem = (data, checkAccount, checkIfAlias, resolveAlias, checkAllowedToUpdate) => {

    // check account in parallel
    const pAccount = checkAccount()
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));

    return db.runTransaction(t => {

      // how to deal with aliases is passed over
      // and returns {pack:the original pack , itemPack:if it was a real item}
      return checkIfAlias()

        // if itemPack is not set then we have a potential alias
        // returns {pack:the original pack,aliasDocPack:the pack from an alias get}
        .then(result => shrinkAliasRef_(t, result, "updater"))

        // sort out all that to a single pack
        .then(result => shrinkAlias_(result, resolveAlias))

        // get the current item
        // returns {pack:pack , item:item result pack,doc: the doc}
        .then(pack => shrinkItemGet_(t, pack))

        // want to make sure the accoutn check is done
        .then(result => pAccount.then(accountPack => accountPack.ok ? result : { pack: accountPack }))

        // get an intent if there is one
        .then(result => {
          if (result.pack.ok) {
            return shrinkCheckIntent_(t, result.pack).then(pack => result);
          }
          else {
            return result;
          }
        })

        // finally the update
        .then(result => {


          // make sure we have everything
          const pack = shrinkCheckGet_(result);

          // make sure that we used an intent if there was one
          manage.errify(!pack.intent || pack.intentUsed,
            "GONE",
            "intent " + pack.intent + " no longer registered",
            pack
          );

          if (pack.ok) {
            // get the meta data and do the update
            const meta = result.item.value.meta;
            const doc = result.doc;
            const newItem = {
              data: data,
              meta: {
                writer: meta.writer,
                readers: pack.readers || meta.readers,
                updaters: pack.updaters || meta.updaters,
                session: pack.session,
                modified: new Date().getTime()
              },
              expires: new Date(pack.validtill).getTime()
            };

            // and that the updaterKey is allowed to do this
            manage.errify(
              checkAllowedToUpdate(meta.writer, meta.updaters),
              "UNAUTHORIZED",
              "that access key is not allowed to update this item",
              pack
            );

            // do the update if we got this far
            if (pack.ok) {
              t.update(doc.ref, newItem);
              pack.size = data.length;
            }
          }
          return pack;
        })

        // final tidy up is to delete the intention since it can only be used once
        .then(pack => {
          if (pack.intentUsed && pack.ok) {
            t.delete(intentRef_(pack.id));
          }

          return pack.ok ? pack : Promise.reject(pack);
        })
        .catch(pack => pack);

    });
  };

  /**
   * removing is quite complex
   * as it needs to be done in transaction
   * this will deal with aliases/getting the item etc.
   * but functions passed through will be used to leverage closure
   * from the caller
   * @param {function} checkIfAlias will see if this item is an alias item key
   * @param {function} resolveAlias if an alias will update the pack with the alias info and validate it
   * @return {Promise}
   */
  ns.removeItem = (checkAccount, checkIfAlias, resolveAlias) => {

    // check account in parallel
    const pAccount = checkAccount()
      .catch(err => Promise.resolve(manage.errify(false, "INTERNAL", err)));

    // the transaction
    return db.runTransaction(t =>

        // how to deal with aliases is passed over
        // and returns {pack:the original pack , itemPack:if it was a real item}
        checkIfAlias()

        // if itemPack is not set then we have a potential alias
        // returns {pack:the original pack,aliasDocPack:the pack from an alias get}
        .then(result => shrinkAliasRef_(t, result, "writer"))

        // sort out all that to a single pack
        .then(result => shrinkAlias_(result, resolveAlias))

        // get the current item
        // returns {pack:pack , item:item result pack,doc: the doc}
        .then(pack => shrinkItemGet_(t, pack))

        // want to make sure the accoutn check is done
        .then(result => pAccount.then(accountPack => accountPack.ok ? result : { pack: accountPack }))

        // finally the delete
        .then(result => {

          // make sure we have everything
          const pack = shrinkCheckGet_(result);

          if (pack.ok) {

            var meta = result.item.value.meta;
            var doc = result.doc;

            // and that the writer is allowed to do this
            manage.errify(
              meta.writer === pack.writer,
              "UNAUTHORIZED",
              "that access key is not allowed to update this item",
              pack,
              "NO_CONTENT"
            );
          }

          if (pack.ok) {
            // good to go
            t.delete(doc.ref);
          }

          // we could delete the alias pack as well but may as well leave to expire
          // as a) it will fail anyway b) might be usefulto know the underlying data has been deleted
          // without the alias
          return pack.ok ? pack : Promise.reject(pack);
        })
      )
      .catch(pack => pack);
  };

  return ns;

})({});

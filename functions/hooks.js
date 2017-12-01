/**
 * handles hooks
 */
module.exports = (function(ns) {


  const functions = require('firebase-functions');
  const dbStore = require('./dbstore');
  const manage = require ('./manage');

  /**
   * this is the functions entry point for all this
   */
  ns.init = () => functions.firestore.document('items/{itemid}')
    .onUpdate(event=> {
      return ns.logEvent(event);
    });

  /**
   * called to process an event
   * @param {object} event a firestore event object
   */
  ns.logEvent = (event) => {

    const data = event.data.data();
    return dbStore.logEvents(event.params.itemid, "update", data.meta.modified )
      .then(pack => {
        return pack.ok ? ns.execEvents(pack.obs, event.eventType) : pack;
      });

  };

  /**
   * execute any webhooks 
   */
  ns.execEvents = (obs, eventType) => {
    // obs is 
    // {ob:the updates done by logevent , item: the watchable document and item pre-update}
    const ax = require('axios');
    ax.create();

    return Promise.all(obs.map(d => {

      // short cuts
      const item = d.item;
      const sx = item.data;
      const watchable = item.watchable;
      const ob = d.ob;
      
      // TODO check that event type is an update
      // eventType == "providers/cloud.firestore/eventTypes/document.write" or "update"
      // we can avoid re-reading the sx key as we have a record
      // of the obs made in this session - so just incorporate them
      sx.latestObservation = ob.latestObservation;
      sx[sx.latestObservation.toString()] = sx.latestObservation;
      sx.watchable = watchable;
      const packet = manage.makeSxpacket(sx, true);

      // writes to a firebase push 
      if (sx.options.type === "push" || sx.options.type === "pull") {
        return dbStore.setUq (sx.options.uq , sx.latestObservation)
        .then (r=>{
          if (!r.ok)console.error ('failed to set uq ', JSON.stringify(r));
          return r;
        });
      }
      
      // posts sx data to a url
      if (sx.options.type === "url") {
        
        // the webhook
        const url = sx.options.url + (sx.options.url.indexOf("?") !== -1 ? "&" : "?") + "watchable=" + sx.watchable;
        // the method
        const method = sx.options.method.toLowerCase();
        // the data as a payload otherwise send in url
        const data = method === "post" || method === "put" || method === "patch" ? packet : null;

        if (!data) url += ("&data=" + encodeURIComponent(JSON.stringify(packet)));
        // the axois options        
        const ac = {
          method: method,
          url: url
        };
        if (data) ac.data = data;
        
        return ax(ac)
          .then(result=> console.log('axois' , result.data))
          .catch(err=> console.log('axois error',err));
      }

    }));
  };

 



  return ns;
})({});

/**
 * using google analytics to 
 * measure by key
 */
module.exports = ((ns) => {

  const secrets = require ('./private/secrets');
  const configs = require ('./configs');
  const axios = require ('axios');
  const baseUrl = "https://www.google-analytics.com/collect";
  const debugUrl = "https://www.google-analytics.com/debug/collect";
  const manage = require ('./manage');
  const debug = false;
  
  // map of custom dimensions
  const cd= {
    account:2,
    key:1,
    method:3,
    operation:4,
    status:5,
    sampleFloor:6
  };
  const cm = {
    size:1
  };
  
  
  let jwt_, anapi_;
  
  /**
  * do an analytics poke
  */
  const post_ = (body) => {
    return axios.post (debug ? debugUrl : baseUrl, body)
      .then (result=>{
        if (result.status !== 200) console.error(result.status + " failed to write analytics " + body);
        if(debug) console.log (result.data);
        return result;
      });
  };
  
  /**
   * fire a single measurement
   */
  ns.hit =  (options) => {

    // now hit analytics - only one, but use batch mode anyway
    ns.batch().hit (options).commit();
    
    // also hit ffirebase

  };
  
  /**
   * returns a function that manages an instance of batch mode
   */
  ns.batch = () => {

    const cloth = {
      batch_:null
    };
      
    cloth.hit = (options) => {
      cloth.batch_ = cloth.batch_ || [];
      cloth.batch_.push (ns.hitParams(options));
      return cloth;
    };
      
    cloth.clear= () => {
      cloth.batch_ = null;
      return cloth;
    };
      
    cloth.commit = ()=> {
      if (!cloth.batch_) return Promise.reject("no data in batch");
      
      return post_( cloth.batch_.map (d=> ns.joinParams (d)).join("\n"))
        .then (result=>{
          cloth.batch_ = null;
          return result;
        });
      };
      
    return cloth;
  };
  
  /**
   * converts the params to something
   * understood by analytics
   */
  ns.joinParams = (params) => Object.keys(params).map(d=>d + '=' + params[d]).join("&");
  
  /**
   * sets up the parameters for a hit
   */
  ns.hitParams = (options) => {


    // many of those arguments will be missing , so fill them in
    const key = options.key  || "nokey";
    const accountId = options.accountId || "anon";
    const method = options.method || "get";
    const size = options.size || 0;
    const status = options.status || 0; // this'll mean unkown
    const action = options.action || "unknown";
    const eventDate = options.eventDate || new Date().getTime();
    
    const sampleFloor = Math.floor (eventDate/secrets.analytics.floorWidth) * secrets.analytics.floorWidth;
    
    // the parameters for measurement protocol
    const params = {
      v:"1",
      t:"event",
      tid:secrets.analytics.trackingCode,
      cid:accountId,
      ds:configs.platform,
      qt:0,
      uid:key,
      an:configs.apiName,
      av:configs.version,
      ec:method,
      ev:size,
      el:action + "-" + status,
      ea:action
    };
    
    // add custom dims & metrics
    params['cd'+cd.key] = key;
    params['cd'+cd.account] = accountId;
    params['cd'+cd.method] = method;
    params['cd'+cd.operation] = action;
    params['cd'+cd.status] = status; 
    params['cd'+cd.sampleFloor] = sampleFloor;
    params['cm'+cm.size] = size;

   
    return params;
  };

  /**
   * get stats from analytics
   */
  ns.getStats = (params) => {

    const accountId = params.accountId;
    const start = params.start ? parseInt(params.start,10) : new Date (2017, 10 , 15).getTime();
    const finish = params.finish ? parseInt(params.finish,10) : new Date().getTime();
    const pack = manage.goodPack ({
      start:start,
      finish:finish,
      accountId: accountId || ""
    });
    
    return ns.auth()
      .then (result=> {
        
        if (!result.ok) return result;
        
        //  single request
        const rr = {
          viewId: secrets.analytics.viewId,
          samplingLevel: "LARGE"
        };
        
        // metrics
        rr.metrics = ["ga:metric" + cm.size,"ga:totalEvents" ].map (d=> {
          return {
            expression: d
          };
        });
        
        // dimensions
        rr.dimensions = ["account" , "key" , "method", "sampleFloor" ].map (d=> {
          return {
            name: "ga:dimension" + cd[d]
          };
        });

        // date ranges TODO - date ranges
        rr.dateRanges =  [{
          startDate: new Date(start).toISOString().split('T')[0],
          endDate: new Date(finish).toISOString().split('T')[0]
        }];
       
        // filters
        if (accountId) {
          rr.dimensionFilterClauses  = [{
            filters:[{
              dimensionName: "ga:dimension" + cd.account,
              expressions: [accountId],
              operator:"IN_LIST"
            }]
          }];
        }

      
        return new Promise ((resolve, reject) => {
          anapi_.reports.batchGet ({
            auth:jwt_,
            resource:{"reportRequests":[rr]}
          }, (e,r) => {
            if(e) {
              manage.errify (
                false,
                "INTERNAL",
                "failed to get analytics",
                pack);
              reject (pack);
            }
            else {
              
              // now we have the result, normalize them
              manage.errify (
                r.reports.length === 1,
                "INTERNAL",
                "got " + r.reports.length + " reports instead of 1",
                pack);
                
              if (!pack.ok) {
                reject (pack);
              }
              else {
                const rows = r.reports[0].data.rows;
                // may need to adjust of sampling happened
                const src = r.reports[0].data.samplesReadCounts;
                const sss = r.reports[0].data.samplingSpaceSizes;
                const sampleAdjust = sss && sss[0] && src && src[0] ? sss[0]/src[0] : 1;
                // pass in a compressed way using this map
                const columns = ["accountId", "coupon","method","slot","size","count","floorWidth"];
                
                const t = (rows || []).map (d =>{
                  return [
                    d.dimensions[0],
                    d.dimensions[1],
                    d.dimensions[2],
                    parseInt(d.dimensions[3],10),
                    Math.round(sampleAdjust*parseInt(d.metrics[0].values[0],10)),
                    Math.round(parseInt(d.metrics[0].values[1],10)),
                    secrets.analytics.floorWidth
                  ];
                });

                pack.value = {
                  sampleAdjust:sampleAdjust,
                  columns:columns,
                  rows:t
                };
                resolve (pack);
              }
            }
          });
        });

      })
      .catch (err=>Promise.resolve (manage.errify(false, "INTERNAL", err, pack)));
    
  };
  
  /*
   * if service account needs starting up
   */
  ns.auth = () => {
    
    // if we've been here before then nothing to do
    if (anapi_ )return Promise.resolve(manage.goodPack());
    
    // get the service account info and auth
    const gp = require('googleapis');
    const sa = require('./private/efxfbanalytics.json');
    jwt_ = new gp.auth.JWT (
      sa.client_email,null,sa.private_key, 
      ['https://www.googleapis.com/auth/analytics.readonly'],
      null
    );
    
    return new Promise ((resolve, reject) => 
      jwt_.authorize((err, tokens) => {
        const pack = manage.errify(!err , "UNAUTHORIZED" , err );
        if (pack.ok) anapi_ = gp.analyticsreporting('v4');
        resolve(pack);
      })
    );


  };
  
  return ns;
})({});


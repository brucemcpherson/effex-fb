module.exports = {
    urlVersion:"/v2",
    version:"2.3.0",
    apiName:"efx",
    platform:"fb",
    plans: {
      "a": {
        "maxSize": 500000,
        "maxLifetime": 10800,
        "lifetime": 3600,
        "limiters": {
          "burst": {
            "seconds": 30,
            "rate": 30
          },
          "minute": {
            "seconds": 120,
            "rate": 60,
          },
          "day": {
            "seconds": 86400,
            "rate": 2000
          },
          "dailywrite": {
            "seconds": 86400,
            "rate": 10240000,
            "type": "quota"
          }
        }
      },
      "b": {
        "maxSize": 1000000,
        "maxLifetime": 86400,
        "lifetime": 3600,
        "limiters": {
          "burst": {
            "seconds": 30,
            "rate": 60
          },
          "minute": {
            "seconds": 120,
            "rate": 180
          },
          "day": {
            "seconds": 86400,
            "rate": 20000
          },
          "dailywrite": {
            "seconds": 86400,
            "rate": 102400000,
            "type": "quota"
          }
        }
      },
      "x": {
        "maxSize": 1000000,
        "maxLifetime": 14400,
        "lifetime": 3600,
        "limiters": {
          "burst": {
            "seconds": 30,
            "rate": 60
          },
          "minute": {
            "seconds": 120,
            "rate": 200
          },
          "day": {
            "seconds": 86400,
            "rate": 10000
          },
          "dailywrite": {
            "seconds": 86400,
            "rate": 51200000,
            "type": "quota"
          }
        }
      }
    }
};
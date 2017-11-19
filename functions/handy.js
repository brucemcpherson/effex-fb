module.exports = (function (ns) {
  
  // various type checking
  ns.checkType = (type, ob) => {
    if (!ns.isType(type, ob)) throw 'expected ' + type + ' but got ' + typeof ob ;
    return ob;
  };

  ns.checkString = (ob) => ns.checkType("string", ob);
  ns.isString = (ob) => ns.isType("string", ob);
  ns.isUndefined = (ob) => ns.isType("undefined", ob);
  ns.isObject = (ob) => ns.isType("object", ob) && !ns.isArray(ob);
  ns.isArray = (ob) => Array.isArray(ob);
  ns.isNull = (ob) => ob === null;
  ns.isType = (type, ob) => typeof ob === type;

  // try to make an object
  ns.tryParse = (str) => {
    
    if (ns.isString(str)){
      try {
        return JSON.parse (str);
      }
      catch (err) {
        // just let the str return
      }
    }
    return str;
  };
  
  //try to clone
  ns.clone = (ob) => {
    return ns.tryParse (JSON.stringify(ob));
  };
  
  return ns;
})({});
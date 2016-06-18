(function(w) {
  if (w.fastXDM) {module.exports = w.fastXDM; return;};

  var handlers = {};
  var onEnvLoad = [];
  var env = {};

// Key generation
  function genKey() {
    var key = '';
    for (i=0;i<5;i++) key += Math.ceil(Math.random()*15).toString(16);
    return key;
  }

  function waitFor(obj, prop, func, self,  count) {
    if (obj[prop]) {
      func.apply(self);
    } else {
      count = count || 0;
      if (count < 1000) setTimeout(function() {
        waitFor(obj, prop, func, self, count + 1)
      }, 0);
    }
  }

  function attachScript(url) {
    setTimeout(function() {
      var newScript = w.document.createElement('script');
      newScript.type = 'text/javascript';
      newScript.src = url || fastXDM.helperUrl;
      waitFor(w.document, 'body', function() {
        w.document.getElementsByTagName('HEAD')[0].appendChild(newScript);
      });
    }, 0);
  }

  function walkVar(value, clean) {
    switch (typeof value) {
      case 'string':
        if (clean) {
          return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }
        return value.replace(/&#039;/g, '\'').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

      case 'object':
        if (Object.prototype.toString.apply(value) === '[object Array]') {
          newValue = [];
          for (var i = 0; i < value.length; i++) {
            newValue[i] = walkVar(value[i], clean);
          }
        } else {
          for (var k in value) {
            newValue = {};
            if (Object.hasOwnProperty.call(value, k)) {
              newValue[k] = walkVar(value[k], clean);
            }
          }
        }
      default:
        newValue = value;
    }

    return newValue;
  }

// Env functions
  function getEnv(callback, self) {
    if (env.loaded) {
      callback.apply(self, [env]);
    } else {
      onEnvLoad.push([self, callback]);
    }
  }

  function envLoaded() {
    env.loaded = true;
    var i = onEnvLoad.length;
    while (i--) {
      onEnvLoad[i][1].apply(onEnvLoad[i][0], [env]);
    }
  }

  function applyMethod(strData, self) {
    getEnv(function(env) {
      var data = env.json.parse(strData);
      if (data[0]) {
        if (!data[1]) data[1] = [];
        var i = data[1].length;
        while (i--) {
          if (data[1][i]._func) {
            var funcNum = data[1][i]._func;
            data[1][i] = function() {
              var args = Array.prototype.slice.call(arguments);
              args.unshift('_func'+funcNum);
              self.callMethod.apply(self, args);
            }
          } else if (self.options.safe) {
            data[1][i] = walkVar(data[1][i], true);
          }
        }
        setTimeout(function() {
          if (!self.methods[data[0]]) {
            throw Error('fastXDM: Method ' + data[0] + ' is undefined');
          }
          self.methods[data[0]].apply(self, data[1]);
        }, 0);
      }
    });
  }

// XDM object
  var fastXDM = {
    _id: 0,
    helperUrl: ((location.protocol === 'https:') ? 'https:' : 'http:') + '//vk.com/js/api/xdmHelper.js',

    Server: function(methods, filter, options) {
      this.methods = methods || {};
      this.id = fastXDM._id++;
      this.options = options || {};
      this.filter = filter;
      this.key = genKey();
      this.methods['%init%'] = this.methods.__fxdm_i = function() {
        fastXDM.run(this.id);
        if (this.methods.onInit) this.methods.onInit();
      };
      this.frameName = 'fXD'+this.key;
      this.server = true;
      handlers[this.key] = [applyMethod, this];
    },

    Client: function(methods, options) {
      this.methods = methods || {};
      this.id = fastXDM._id++;
      this.options = options || {};
      fastXDM.run(this.id);
      if (w.name.indexOf('fXD') === 0) {
        this.key = w.name.substr(3);
      } else {
        throw Error('Wrong window.name property.');
      }
      this.caller = w.parent;
      handlers[this.key] = [applyMethod, this];
      this.client = true;

      fastXDM.on('helper', function() {
        fastXDM.onClientStart(this);
      }, this);

      getEnv(function(env) {
        env.send(this, env.json.stringify(['%init%']));
        var methods = this.methods;
        setTimeout(function() {
          if (methods.onInit) methods.onInit();
        }, 0);
      }, this);
    },

    onMessage: function(e) {
      if (!e.data) return false;
      var data = e.data;
      if (typeof data != 'string' && !(data instanceof String)) return false;
      var key = data.substr(0, 5);
      if (handlers[key]) {
        var self = handlers[key][1];
        if (self && (!self.filter || self.filter(e.origin))) {
          handlers[key][0](e.data.substr(6), self);
        }
      }
    },

    setJSON: function(json) {
      env.json = json;
    },

    getJSON: function(callback) {
      if (!callback) return env.json;
      getEnv(function(env) {
        callback(env.json);
      });
    },

    setEnv: function(exEnv) {
      var i;
      for (i in exEnv) {
        env[i] = exEnv[i];
      }
      envLoaded();
    },

    _q: {},

    on: function(key, act, self) {
      if (!this._q[key]) this._q[key] = [];
      if (this._q[key] == -1) {
        act.apply(self);
      } else {
        this._q[key].push([act, self]);
      }
    },

    run: function(key) {
      var len = (this._q[key] || []).length;
      if (this._q[key] && len > 0) {
        for (var i = 0; i < len; i++) this._q[key][i][0].apply(this._q[key][i][1]);
      }
      this._q[key] = -1;
    },

    waitFor: waitFor
  }

  fastXDM.Server.prototype.start = function(obj, count) {
    if (obj.contentWindow) {
      this.caller = obj.contentWindow;
      this.frame = obj;

      fastXDM.on('helper', function() {
        fastXDM.onServerStart(this);
      }, this);

    } else { // Opera old versions
      var self = this;
      count = count || 0;
      if (count < 50) setTimeout(function() {
        self.start.apply(self, [obj, count+1]);
      }, 100);
    }
  }

  fastXDM.Server.prototype.destroy = function() {
    handlers.splice(handlers.indexOf(this.key), 1);
  }

  function extend(obj1, obj2){
    for (var i in obj2) {
      if (obj1[i] && typeof(obj1[i]) == 'object') {
        extend(obj1[i], obj2[i])
      } else {
        obj1[i] = obj2[i];
      }
    }
  }

  fastXDM.Server.prototype.append = function(obj, options) {
    var div = w.document.createElement('DIV');
    div.innerHTML = '<iframe name="'+this.frameName+'" ></iframe>';
    var frame = div.firstChild;
    var self = this;
    setTimeout(function() {
      frame.frameBorder = '0';
      if (options) extend(frame, options);
      obj.insertBefore(frame, obj.firstChild);
      self.start(frame);
    }, 0);
    return frame;
  }

  fastXDM.Client.prototype.callMethod = fastXDM.Server.prototype.callMethod = function() {
    var args = Array.prototype.slice.call(arguments);
    var method = args.shift();
    var i = args.length;
    while (i--) {
      if (typeof(args[i]) == 'function') {
        this.funcsCount = (this.funcsCount || 0) + 1;
        var func = args[i];
        var funcName = '_func' + this.funcsCount;
        this.methods[funcName] = function() {
          func.apply(this, arguments);
          delete this.methods[funcName];
        }
        args[i] = {_func: this.funcsCount};
      } else if (this.options.safe) {
        args[i] = walkVar(args[i], false);
      }
    }
    waitFor(this, 'caller', function() {
      fastXDM.on(this.id, function() {
        getEnv(function(env) {
          env.send(this, env.json.stringify([method, args]));
        }, this);
      }, this);
    }, this);
  }

  if (w.JSON && typeof(w.JSON) == 'object' && w.JSON.parse && w.JSON.stringify && w.JSON.stringify({a:[1,2,3]}).replace(/ /g, '') == '{"a":[1,2,3]}') {
    env.json = {parse: w.JSON.parse, stringify: w.JSON.stringify};
  } else {
    fastXDM._needJSON = true;
  }

// PostMessage cover
  if (w.postMessage) {
    env.protocol = 'p';
    env.send = function(xdm, strData) {
      var win = (xdm.frame ? xdm.frame.contentWindow : xdm.caller);
      win.postMessage(xdm.key+':'+strData, "*");
    }
    if (w.addEventListener) {
      w.addEventListener("message", fastXDM.onMessage, false);
    } else {
      w.attachEvent("onmessage", fastXDM.onMessage);
    }

    if (fastXDM._needJSON) {
      fastXDM._onlyJSON = true;
      attachScript();
    } else {
      envLoaded();
    }
  } else {
    attachScript();
  }

module.exports = fastXDM;

})(window);

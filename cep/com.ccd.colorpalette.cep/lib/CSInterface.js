(function () {
  "use strict";

  if (window.CSInterface) {
    return;
  }

  window.SystemPath = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension",
    HOST_APPLICATION: "hostApplication"
  };

  function CSInterface() {}

  CSInterface.prototype.evalScript = function (script, callback) {
    var done = callback || function () {};
    if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
      window.__adobe_cep__.evalScript(script, done);
      return;
    }
    done("");
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    if (window.__adobe_cep__ && window.__adobe_cep__.getSystemPath) {
      return window.__adobe_cep__.getSystemPath(pathType);
    }
    return "";
  };

  CSInterface.prototype.addEventListener = function (type, listener, obj) {
    if (window.__adobe_cep__ && window.__adobe_cep__.addEventListener) {
      window.__adobe_cep__.addEventListener(type, listener, obj);
    }
  };

  CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    if (window.__adobe_cep__ && window.__adobe_cep__.removeEventListener) {
      window.__adobe_cep__.removeEventListener(type, listener, obj);
    }
  };

  window.CSInterface = CSInterface;
}());

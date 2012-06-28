/*
Inject
Copyright 2011 LinkedIn

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an "AS
IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
express or implied.   See the License for the specific language
governing permissions and limitations under the License.
*/

var Communicator;
(function() {
  var AsStatic = Class.extend(function() {
    var pauseRequired = false;
    var DB = DataBase.create("communicator", "queue");
    var cbQueue = DB.create("callbacks");
    var socketQueue = DB.create("pendingSocketRequests");
    var socket;

    function trimHost(host) {
      host = host.replace(HOST_PREFIX_REGEX, "").replace(HOST_SUFFIX_REGEX, "$1");
      return host;
    }

    // when a file completes, resolve all callbacks in its queue
    function resolveCompletedFile(url, statusCode, contents) {
      // locate all callbacks associated with the URL
      cbQueue.each(function(cb) {
        if (statusCode !== 200) {
          cb(false);
        }
        else {
          cb(contents);
        }
      })
    }

    // set up our easyXDM socket
    function createSocket() {
      var relayFile = userConfig.xd.relayFile;
      var relaySwf = userConfig.xd.relaySwf || "";
      relayFile += (relayFile.indexOf("?") >= 0) ? "&" : "?";
      relayFile += "swf="+relaySwf;

      socket = new easyXDM.Socket({
        remote: relayFile,
        swf: relaySwf,
        onMessage: function(message, origin) {
          if (typeof(userConfig.moduleRoot) === "string" && trimHost(userConfig.moduleRoot) !== trimHost(origin)) {
            return;
          }
          var pieces = message.split("__INJECT_SPLIT__");
          // pieces[0] file URL
          // pieces[1] status code
          // pieces[2] file contents
          resolveCompletedFile(pieces[0], pieces[1], pieces[2]);
        },
        onReady: function() {
          pauseRequired = false;
          socketQueue.each(function(fn) {
            fn();
          });
        }
      });
    }

    // these are our two senders, either via easyXDM or via standard xmlHttpRequest
    function sendViaIframe(url) {
      socket.postMessage("#{path}");
    }
    function sendViaXHR(url) {
      var xhr = getXhr();
      xhr.open("GET", url);
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          resolveCompletedFile(url, xhr.status, xhr.responseText);
        }
      };
      xhr.send(null);
    }

    return {
      init: function() {},
      get: function(url, callback) {
        cbQueue.add(callback);

        if (userConfig.xd.relayFile && !socket && !pauseRequired) {
          pauseRequired = true;
          window.setTimeout(createSocket);
        }

        var socketQueuedFn = function() {
          sendViaIframe(url);
        };

        if (pauseRequired) {
          socketQueue.add(socketQueuedFn);
        }
        else {
          if (userConfig.xd.relayFile) {
            sendViaIframe(url);
          }
          else {
            sendViaXHR(url);
          }
        }
      }
    };
  });
  Communicator = new AsStatic();
})();
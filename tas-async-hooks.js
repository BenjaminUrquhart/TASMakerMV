// Hook setInterval, clearInterval, setTimeout, and clearTimeout
{
    let callbackID = 0;
    const callbacks = {};
    function setupCallback(params, repeat) {
        let args = [];
        let id = callbackID++;
        for(let i = 2; i < params.length; i++) {
            args.push(params[i]);
        }

        let func = params[0];
        let wait = params[1];
        let callback = {
            func: func,
            time: TAS.time + wait,
            args: args,
            wait: wait,
            repeat: repeat
        }
        callbacks[id] = callback;
        return id;
    }

    function setupCallbackHooks() {
        window.setTimeout = function() {
            setupCallback(arguments, false);
        }

        window.setInterval = function() {
            setupCallback(arguments, true);
        }

        window.clearTimeout = window.clearInterval = function(id) {
            delete callbacks[id];
        }
    }

    function runCallbacks() {
        for(let id in callbacks) {
            let callback = callbacks[id];
            if(callback.time <= TAS.time) {
                let func = callback.func;
                if(typeof func === "string") {
                    eval(func);
                }
                else {
                    func(...callback.args);
                }
                if(callback.repeat) {
                    callback.time += callback.wait;
                }
                else {
                    delete callbacks[id];
                }
            }
        }
    }

    const bootStart = Scene_Boot.prototype.create;
    Scene_Boot.prototype.create = function() {
        setupCallbackHooks();
        bootStart.call(this);
    }

    window.runCallbacks = runCallbacks;
}
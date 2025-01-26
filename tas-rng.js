// TODO: implement the RNG algorithm Chromium uses
class RNG {
    constructor(seed, logging) {
        if (seed === undefined) {
            seed = Date.now();
        }
        this.logging = !!logging;
        this.rngState = seed % 2147483647;
        this.locked = false;
        this.calls = 0;

        this.callers = {};
    }
    logRNGCaller() {
        if(!this.logging) return;
        const { func, file } = TAS.getCaller("Math.random");
        
        if(!this.callers[file]) {
            this.callers[file] = {}

            Object.defineProperty(this.callers[file], "totalCalls", {
                get: function() {
                    let out = 0;
                    for(let key in this) {
                        out += this[key];
                    }
                    return out;
                }
            })
        }
        if(!this.callers[file][func]) {
            this.callers[file][func] = 0;
        }
        this.callers[file][func]++;
    }
    advanceState() {
        if (!this.locked) {
            this.logRNGCaller();
            this.rngState = (this.rngState * 16807) % 2147483647;
            if (this.rngState < 1) {
                this.rngState = 1;
            }
            this.calls++;
        }
        return this.rngState;
    }
    next() {
        return (this.advanceState() - 1) / 2147483646;
    }
    unlock() {
        this.locked = false;
    }
    lock() {
        this.locked = true;
    }
}


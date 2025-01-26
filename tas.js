function simpleClone(obj) {
    const out = {};
    for(let key in obj) {
        out[key] = obj[key];
    }
    return out;
}

function TAS() { throw new Error("Static class"); }

TAS.State = Object.freeze({
    RECORDING: Symbol("Recording"),
    PLAYBACK:  Symbol("Playback")
});

// RNG stuff
TAS.pluginBlacklist = [
    "Olivia_HorrorEffects.js",
    "MPP_EncounterEffect.js",
    "MOG_TitleParticles.js",
    "MOG_BattlerMotion.js",
    "MOG_Weather_EX.js"
];
TAS.functionBlacklist = [];


// Actual init down here
{
    // copy some stuff out for convenience
    window.TAS = TAS;
    const State = TAS.State;

    const fs = require("fs");
    const gui = require("nw.gui");
    
    TAS.initialize = function() {
        this.state = State.PLAYBACK;
        
        if(this.state === State.PLAYBACK && fs.existsSync("movie.json")) {
            this.movie = JSON.parse(fs.readFileSync("movie.json"));
            if(!this.movie.inputNames) {
                let frames = this.movie.frames;
                let names = this.movie.inputNames = [];
                for(let i = 0; i < frames.length; i++) {
                    let frame = frames[i];
                    for(let input in frame) {
                        if(input !== "tab" && names.indexOf(input) === -1) {
                            names.push(input);
                        }
                    }
                }
            }
        }
        else {
            this.movie = { 
                frames: [],
                inputNames: [],
                seed: Date.now()
            };
        }

        this.logRNGCalls = false;
        this.filterRNGCalls = false;

        this.blacklistRNG = new RNG(Date.now(), this.logRNGCalls);
        this.rng = new RNG(this.movie.seed, this.logRNGCalls);

        this.time = 0;
        this.frame = 0;
        this.wantedFrame = 0;

        this.step = false;
        this.active = true;
        this.waiting = false;
        document.addEventListener('keydown', (event) => {
            if(event.key === "Tab") {
                this.active = !this.active;
            }
            else if(event.key === "v" || event.key === "V") {
                this.step = this.active;
            }
            else if(this.state === State.RECORDING && (event.key === "s" || event.key === "S")) {
                fs.writeFileSync("movie.json", JSON.stringify(this.movie));
                console.log("Saved movie");
            }
        });

        this.tasWindow = undefined;
    
        this.gameRenderTex = undefined;
        this.gameRenderSprite = undefined;

        this.setupHooks();
        this.createFrameView();
        this.preloadAssets();
    }

    TAS.setupHooks = function() {
        // Randomness
        Math.random = function() {
            if(TAS.filterRNGCalls) {
                const { func, file } = TAS.getCaller("Math.random");
                if(TAS.pluginBlacklist.indexOf(file) !== -1 || TAS.functionBlacklist.indexOf(func) !== -1) {
                    return TAS.blacklistRNG.next();
                }
            }
            return TAS.rng.next();
        }

        // Scene loading
        const goto = SceneManager.goto;
        SceneManager.goto = function(scene) {
            console.log(`Pushed ${JsonEx._getConstructorName(scene.prototype)} on frame ${TAS.frame}`);
            goto.call(this, scene);
        }
        
        const onSceneStart = SceneManager.onSceneStart;
        SceneManager.onSceneStart = function() {
            console.log(`${JsonEx._getConstructorName(this._scene)} started on frame ${TAS.frame}`);
            onSceneStart.call(this);
        }

        // Rendering
        Graphics.render = function(stage) {
            if(stage) {
                if(!TAS.gameRenderTex) {
                    TAS.gameRenderTex = new PIXI.RenderTexture.create(Graphics.boxWidth, Graphics.boxHeight);
                    TAS.gameRenderSprite = new PIXI.Sprite(TAS.gameRenderTex);
                }
                this._renderer.render(stage, TAS.gameRenderTex);
            }
            if(TAS.gameRenderSprite) {
                this._renderer.render(TAS.gameRenderSprite);
            }
            if(TAS.tasWindow) {
                this._renderer.render(TAS.tasWindow, undefined, false);
            }
            if (this._renderer.gl && this._renderer.gl.flush) {
                this._renderer.gl.flush();
            }
            this._skipCount = 0;
            this._rendered = true;
            this.frameCount++;
        }


        // Scene update
        SceneManager._getTimeInMsWithoutMobileSafari = () => TAS.time;

        let requestFrame = true;
        const requestUpdate = SceneManager.requestUpdate;
        SceneManager.requestUpdate = function() {
            if(requestFrame) {
                requestUpdate.call(this);
            }
        }

        const update = SceneManager.update;
        SceneManager.update = function() {
            if(!requestFrame) {
                throw new Error("Recursion detected");
            }
            // leave some wiggle room to make sure we can catch the next real frame
            const limit = Date.now() + this._deltaTime * 900;

            if($gameSystem && !TAS.tasWindow) {
                TAS.tasWindow = new Window_TAS();
            }
            let frame = TAS.frame;
            if(TAS.frame < TAS.wantedFrame && this.isCurrentSceneStarted()) {
                requestFrame = false;
                while(Date.now() < limit && TAS.frame < TAS.wantedFrame && this.isCurrentSceneStarted()) {
                    TAS.active = false;
                    this.gameTick();
                }
                frame = TAS.wantedFrame;
                TAS.active = true;
                requestFrame = true;
                this.requestUpdate();
            }
            else {
                this.gameTick();
            }
            if(TAS._frameView?.window && !TAS._frameView.window.busy) {
                TAS._frameView.window.tick(frame);
            }
        }

        SceneManager.gameTick = function() {
            if(!this.isCurrentSceneStarted()) {
                TAS.rng.lock();
                TAS.time += this._deltaTime * 1000;
                runCallbacks();
                update.apply(this, arguments);
            }
            else if(!TAS.active || TAS.step) {
                if(TAS.state === State.PLAYBACK) {
                    let data = TAS.movie.frames[TAS.frame];
                    if(data) {
                        Input._previousState = Input._currentState;
                        Input._currentState = simpleClone(data);
                    }
                    else {
                        TAS.active = true;
                    }
                }
                else if(TAS.state === State.RECORDING) {
                    let inputs = simpleClone(Input._currentState);
                    delete inputs["tab"];
                    TAS.movie.frames[TAS.frame] = inputs;
                }
                if(!TAS.active || TAS.step) {
                    TAS.time += this._deltaTime * 1000;
                    TAS.rng.unlock();
                    runCallbacks();
                    TAS.tasWindow?.update();
                    update.apply(this, arguments);
                    TAS.rng.lock();
                    TAS.step = false;
                    TAS.frame++;
                    return;
                }
                else {
                    this.requestUpdate();
                }
            }
            else if(!TAS.step) {
                this.requestUpdate();
            }
            if(requestFrame) {
                TAS.tasWindow?.update();
                Graphics.render();
            }
        }

        // Inputs
        let clearInput = Input.clear;
        Input.clear = function() {
            if(TAS.state === State.RECORDING) {
                clearInput.call(this);
            }
        }
        
        let onDown = Input._onKeyDown;
        Input._onKeyDown = function(event) {
            if(TAS.state === State.RECORDING) {
                onDown.call(this, event);
            }
        }
        
        let onUp = Input._onKeyUp;
        Input._onKeyUp = function(event) {
            if(TAS.state === State.RECORDING) {
                onUp.call(this, event);
            }
        }
        
        let updateInput = Input.update;
        Input.update = function() {
            if(SceneManager.isCurrentSceneStarted()) {
                updateInput.call(this);
            }
        }

        clearInput.call(Input);
        this.rng.lock();
    }

    TAS.createFrameView = function() {
        let current = gui.Window.get();
        gui.Window.open("www/tas-ui.html", {
            title: "TASMaker MV | " + document.title
        }, function(w) {
            TAS._frameView = w;
            current.on("close", TAS._onWindowClose.bind(TAS));

            w.on("loaded", () => w.window.setup(TAS));
            w.on("close",  TAS._onFrameViewUnload.bind(TAS));
        });
    }

    TAS.preloadAssets = function() {
        // preload image assets
        for(let key in ImageManager) {
            if(key.startsWith("reserve")) {
                let funcStr = Function.prototype.toString.call(ImageManager[key]);
                let match = funcStr.match(/(img\/.*\/)/g);
                if(match) {
                    console.log(`Preloading folder ${match[0]} (ImageManager.${key})`);
                    fs.readdir("www/" + match[0], ((path, loader) => (err, files) => {
                        if(err) {
                            console.warn(err);
                            return;
                        }
                        files.forEach(bg => {
                            try {
                                loader.call(ImageManager, bg.endsWith(".png") ? bg.substring(0, bg.length - 4) : bg, 0, TAS.movie.seed);
                                console.log(`Loaded ${path}${bg}`);
                            }
                            catch(e) {
                                console.warn(e);
                            }
                        });
                    })(match[0], ImageManager[key]));
                }
            }
        }
    }

    TAS.getCaller = function(base) {
        if(!base) {
            throw new Error("No base given");
        }
        const trace = (new Error()).stack.split("\n");
        do {
            trace.shift();
        } while(trace.length && trace[0].indexOf(base) === -1);

        if(!trace.length) {
            throw new Error(`Base call (${base}) is not in call stack`);
        }
        else if(trace.length === 1) {
            throw new Error(`Base call (${base}) cannot be at base of stack`);
        }
        trace.shift();
    
        const caller = trace[0].substring(7);
        const match = caller.matchAll(/([^\s]+)\s+\(.*\/([^:]+):.*/g).next().value;
        if(match) {
            return [match[1], match[2]];
        }
        throw new Error(`Failed to parse trace: "${caller}"`);
    }

    TAS._onWindowClose = function() {
        if(this._frameView && !this._frameView.closed) {
            this._onFrameViewUnload();
        }
        gui.Window.get().close(true);
    }

    TAS._onFrameViewUnload = function() {
        this._frameView.close(true);
        this._frameView = undefined;
    }
}

TAS.initialize();


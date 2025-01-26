class Window_TAS extends Window_Base {

    static blankSkin;

    constructor() {
        super(0, 0, Graphics.boxWidth, Graphics.boxHeight);
    }
    loadWindowskin() {
        // This version of Chromium doesn't support static initializers.
        // I hate everything.

        if(!Window_TAS.blankSkin) {
            Window_TAS.blankSkin = new Bitmap(192, 192);
            Window_TAS.blankSkin.clear();
            Window_TAS.blankSkin.fillRect(96, 96, 96, 96, "#ffffff");
        }

        this.windowskin = Window_TAS.blankSkin;
    }
    update() {
        this.opacity = 0;
        super.update();
        this.opacity = 1;
        this.visible = true;

        const ctx = this.contents;
        ctx.clear();

        ctx.fontSize = 20;

        let keys = [];
        for(let key in Input._currentState) {
            if(Input._currentState[key]) {
                keys.push(key);
            }
        }

        let frameText = String(TAS.frame);
        let movieLen = TAS.movie.frames.length;
        if(movieLen >= TAS.frame && TAS.state === TAS.State.PLAYBACK) {
            frameText += "/" + movieLen;
        }

        let keyText = keys.filter(key => key !== "tab").map(key => "[" + key + "]").join(" ");
        let stateText = `${frameText} | ${TAS.state.toString().match(/Symbol\((.*)\)/)[1]}`;
        if(TAS.state === TAS.State.PLAYBACK) {
            if(movieLen <= TAS.frame) {
                stateText += " (Finished)";
            }
            else if(TAS.active) {
                stateText += " (Paused)";
            }
        }

        ctx.fillRect(0, 0, 816, 50, "#808080a0");
        this.drawText(stateText, 10, 10, this.width, "left");
        this.drawText(keyText, this.width - 50 - this.textWidth(keyText), 10, this.width, "left");
    }
    refresh() {
        this.contents.clear();
    }
}
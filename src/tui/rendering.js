const RelayAPI = require("../RelayAPI");
const colours = require("../utils/colours");
const { relayPort } = require("../utils/config");
const Utils = require("./utils");

class Rendering {
    constructor(tui) {
        this.tui = tui;

        this.menuActions = {
            login: [["↑/↓", "Move"], ["↲", "Submit"], ["Tab", "Go Signup"], ["Esc", "Exit"]],
            signup: [["↑/↓", "Move"], ["↲", "Submit"], ["Tab", "Go Login"], ["Esc", "Exit"]],
            home: [["↑/↓", "Move"], ["↲", "Select"], ["Esc", "Exit"]],
            offline: [["↑/↓", "Move"], ["↲", "Select"], ["Esc", "Exit"]],
            join: [["↲", "Join"], ["^C", "Paste"], ["Esc", "Back"]],
            create: [["↑/↓", "Move"], ["←/→", "Change Value"], ["↲", "Edit/Select"], ["Esc", "Back"]],
            room: [["↑/↓", "Move"], ["Del", "Kick"], ["Esc", "Leave Room"]],
            about: [["d", "Discord"], ["g", "GitHub"], ["w", "Website"], ["Esc", "Back"]],
            message: []
        };
    };

    showMessage(message, nextMenu, delay = 2000) {
        if (this.messageTimeout) clearTimeout(this.messageTimeout);

        this.tui.screenMsg = message;
        this.tui.menu = "message";
        this.render();

        if (nextMenu) {
            this.messageTimeout = setTimeout(() => {
                this.tui.menu = nextMenu;
                this.render();
            }, delay);
        };
    };

    clearScreen() {
        process.stdout.write('\u001b[3J\u001b[1J');
        console.clear();
    };

    render() {
        this.clearScreen();

        const termWidth = process.stdout.columns || 80;
        const termHeight = process.stdout.rows || 25;

        let output = "";
        if (termHeight < 10 || termWidth < 50) {
            output += `${colours.fg.blue}Terminal is too small${colours.reset}`;
        } else {
            const title = "----  Standalone LC Relay Client  ----";
            const banner = title
                .padStart(Math.floor((termWidth + title.length) / 2), " ")
                .padEnd(termWidth, " ");

            output += `${colours.bg.blue}${colours.fg.black}${banner}${colours.reset}\n\n`;
            output += this.renderBody();

            const currentLines = output.split('\n').length;
            const remainingLines = termHeight - currentLines - 1;
            
            output += '\n'.repeat(Math.max(0, remainingLines));
            output += this.renderActionBar();
        };

        const hideCursor = "\u001B[?25l";
        process.stdout.write(output + '\u001b[J' + hideCursor);
    };

    renderBody() {
        switch(this.tui.menu) {
            case "login":
            case "signup":
                return this.renderAuth();
            case "home":
                return this.renderHome();
            case "offline":
                return this.renderOffline();
            case "join":
                return this.renderJoinRoom();
            case "create":
                return this.renderCreateRoom();
            case "about":
                return this.renderAbout();
            case "room":
                return this.renderRoom();
            case "message":
                return this.renderMessage();
        };
    };

    renderActionBar() {
        const termWidth = process.stdout.columns || 80;
        
        const currentActions = this.menuActions[this.tui.menu] || [];
        const actionText = currentActions.map(a => `${colours.bg.blue}${colours.fg.black}${colours.bright} ${a[0]} ${colours.reset}${colours.dim} ${a[1]} ${colours.reset}`).join("  ");
        return ` ${actionText}`.padEnd(termWidth, " ") + colours.reset;
    };

    renderAuth() {
        let titleText = this.tui.menu === "login" ? "Account Login" : "Account Signup";
        let ui = `${colours.fg.gray}${colours.bright}   ${titleText}:${colours.reset}\n\n${colours.fg.gray}   Fields can only contain letters and numbers${colours.reset}\n\n`;

        this.tui.authFields.forEach((f, i) => {
            const isFocused = this.tui.focusIndex === i;
            const style = isFocused ? `${colours.bg.blue}${colours.fg.black}` : `${colours.fg.blue}`;

            if (f.type === "action") {
                ui += `\n   ${style} • Submit  ${colours.reset}\n`;
            } else {
                let dispValue = f.masked ? "*".repeat(f.value.length) : f.value;
                if (isFocused && f.value.length < 24) dispValue += `${colours.blink}_${colours.reset}${style}`;
                ui += `   ${style} • ${f.label.padEnd(8)}: ${dispValue.padEnd(30, " ")} ${colours.reset}\n`;
            };
        });

        return ui;
    };

    renderHome() {
        let output = `   Logged in as: ${colours.fg.blue}${RelayAPI.user.username}${colours.reset}\n\n` +
                     `${colours.fg.gray}${colours.bright}   Select Action:${colours.reset}\n`;
                     
        [
            "Join Room",
            "Create Room",
            "About LC Relay",
            "Logout Account"
        ].forEach((option, i) => {
            const isSelected = this.tui.focusIndex === i;
            const isLogout = i === 3;
            const style = isLogout && isSelected ? `${colours.bg.red}${colours.fg.black}${colours.bright}` :
                          isSelected ? `${colours.bg.blue}${colours.fg.black}` :
                          isLogout   ? `${colours.fg.red}${colours.bright}`
                                     : `${colours.fg.blue}`;
            
            output += `   ${style} • ${option.padEnd(15)} ${colours.reset}\n`;
        });

        output += `${colours.reset}`;
        return output;
    };

    renderOffline() {
        let output = `${colours.fg.red}${colours.bright}   ${this.tui.connectErrReason || "Failed to connect to LC Relay"}${colours.reset}\n\n` +
                     `${colours.fg.gray}${colours.bright}   Select Action:${colours.reset}\n`;
    
        [
            "Retry",
            "About LC Relay"
        ].forEach((option, i) => {
            const isSelected = this.tui.focusIndex === i;
            const style = isSelected ? `${colours.bg.blue}${colours.fg.black}` : `${colours.fg.blue}`;
            
            output += `   ${style} • ${option.padEnd(15)} ${colours.reset}\n`;
        });

        output += `${colours.reset}`;
        return output;
    };

    renderAbout() {
        const termWidth = process.stdout.columns - 3 || 80;
        const aboutContent = [
            "LC Relay is a system for playing multiplayer LCE over the internet.",
            "It is used as a replacement for PSN and Xbox Live which the original LCE used.",
            "",
            "It was originally developed for LC Launcher, but is now used in other projects!",
            "",
            "LC Relay, LC Launcher and this client were developed by TheHuckle (https://huckle.dev)"
        ];

        const wrappedText = Utils.wrapLines(aboutContent, termWidth, "   ", colours.fg.white);
        
        return `${wrappedText}\n\n` +
               `${colours.fg.gray}${colours.bright}   Select Action:${colours.reset}\n` +
               `   ${colours.fg.blue}${colours.dim} d ${colours.reset}${colours.fg.blue}Join Discord ${colours.reset}\n` +
               `   ${colours.fg.blue}${colours.dim} g ${colours.reset}${colours.fg.blue}Open TheHuckle's Github ${colours.reset}\n` +
               `   ${colours.fg.blue}${colours.dim} w ${colours.reset}${colours.fg.blue}Open TheHuckle's Website ${colours.reset}\n` +
               `\n${colours.reset}`;
    };

    renderJoinRoom() {
        const roomCodeFixed = this.tui.roomCode.padEnd(6, "_");
        const codeRender = roomCodeFixed.slice(0, 3) +
                            colours.fg.gray + "-" + colours.reset +
                            colours.fg.blue +
                            roomCodeFixed.slice(3, 6);
        
        return `${colours.fg.gray}${colours.bright}   Enter Room Code:${colours.reset}\n` +
                `${colours.fg.blue}    ${codeRender}${colours.reset}`;
    };

    renderCreateRoom() {
        const settingWidth = 28;
        let ui = `${colours.fg.gray}${colours.bright}   Room Settings:${colours.reset}\n`;

        const actionSettings = this.tui.settings.filter(e => e.type === "action");
        const nonActionSettings = this.tui.settings.filter(e => e.type !== "action");

        nonActionSettings.forEach((s) => {
            const i = this.tui.settings.indexOf(s);
            const isSelected = this.tui.focusIndex === i;
            const isCurrentlyEditing = isSelected && this.tui.isEditing;

            const style = isCurrentlyEditing ? `${colours.bg.yellow}${colours.fg.black}` : 
                          isSelected ? `${colours.bg.blue}${colours.fg.black}` :
                                       `${colours.fg.blue}`;
            const valueRender = isCurrentlyEditing ? `[ ${s.value} ]` : s.value;
            
            const renderLine = `   ${style} • ${s.label}: ${valueRender} `;
            ui += `${renderLine}${" ".repeat(Math.max(0, settingWidth - Utils.getPrintedLen(renderLine)))}${colours.reset}\n`;
        });

        ui += `\n`; // separator for actions

        actionSettings.forEach((s) => {
            const i = this.tui.settings.indexOf(s);
            const isSelected = this.tui.focusIndex === i;
            const style = isSelected ? `${colours.bg.blue}${colours.fg.black}${colours.bright}` :
                                       `${colours.fg.blue}${colours.bright}`;
            
            const renderLine = `   ${style} • ${s.label} `;
            ui += `${renderLine}${" ".repeat(Math.max(0, settingWidth - Utils.getPrintedLen(renderLine)))}${colours.reset}\n`;
        });

        ui += `${colours.reset}`;
        return ui;
    };

    renderRoom() {
        this.tui.focusIndex = Math.min(this.tui.focusIndex, Math.max(0, this.tui.state.players.length - 1));

        const termHeight = process.stdout.rows || 25;
        const termWidth = process.stdout.columns || 60;

        const chunkWidth = 30;
        const maxChunks = Math.floor((termWidth - 8) / chunkWidth); // 8 for the 4 spaces of padding on each side
        let playersPerChunk = Math.max(termHeight - 3 - 7, 4); // 3 for the footer and empty line, 7 for the header
        let playerChunks = Utils.chunkArray(this.tui.state.players, playersPerChunk);
        const playerCount = this.tui.state.players.length;
        const maxCount = this.tui.state.settings.maxPlayers || 32;
        while (playerChunks.length > maxChunks) {
            playersPerChunk++;
            playerChunks = Utils.chunkArray(this.tui.state.players, playersPerChunk);
        };

        const codeRender = this.tui.roomCode.slice(0, 3) +
                            colours.fg.gray + "-" + colours.reset +
                            colours.fg.blue +
                            this.tui.roomCode.slice(3, 6);
        
        let relayHint = this.tui.state.players.find(p => p.isHost)?.isMe ?
                        `Start hosting your world to allow players to join` :
                        `Join 127.0.0.1:${relayPort} inside your game`;

        let ui = `   Room Code: ${colours.fg.blue}${codeRender}${colours.reset}\n` +
                 `   Players: ${colours.fg.blue}${playerCount}${colours.reset} ${colours.fg.gray}/ ${colours.bright}${maxCount}${colours.reset}\n` +
                 `   ${colours.fg.gray}${colours.dim}${relayHint}${colours.reset}\n\n` +
                 `   ${colours.fg.gray}${colours.bright}Player List:${colours.reset}\n`;

        for (let row = 0; row < playersPerChunk; row++) {
            let rowString = "   ";
            playerChunks.forEach((col, chunkIndex) => {
                if (!col[row]) return;

                const p = col[row];
                const i = chunkIndex * playersPerChunk + row;

                let nameContainer = chunkWidth - 4;
                if (!!p.isHost) nameContainer -= 7;
                if (!!p.isMe) nameContainer -= 5;
                const name = Utils.truncateText(p.username, nameContainer);
                const displayName = `${name}` +
                                    (!!p.isMe ? ` ${colours.fg.gray}(Me)` : "") +
                                    (!!p.isHost ? ` ${colours.fg.blue}${colours.dim}(Host)` : "");

                if (this.tui.focusIndex === i) rowString += `${colours.bg.blue}${colours.fg.black}`;
                else rowString += `${colours.fg.blue}`;

                rowString += ` • ${displayName}${" ".repeat(Math.max(0, chunkWidth - 2 - Utils.getPrintedLen(displayName)))}${colours.reset}`;
            });
            if (rowString.trim()) ui += rowString + "\n";
        };
        
        ui += `${colours.reset}`;
        
        return ui;
    };

    renderMessage() {
        return `   ${colours.fg.gray}${colours.bright}${this.tui.screenMsg}${colours.reset}`;
    };
};

module.exports = Rendering;
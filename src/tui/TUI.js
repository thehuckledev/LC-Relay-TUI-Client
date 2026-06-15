const RelayAPI = require("../RelayAPI");
const VLANRelay = require("../VLANRelay");
const colours = require("../utils/colours");
const Rendering = require("./rendering");
const Utils = require("./utils");

class TUI {
    constructor() {
        this.r = new Rendering(this);
        VLANRelay.r = this.r;

        this.state = {
            inRoom: false,
            players: [],
            settings: {}
        };
        
        this.menu = "message";
        this.screenMsg = "Connecting to LC Relay...";
        this.roomCode = "";
        this.focusIndex = 0;

        this.connectErr = false;
        this.connectErrReason = "";

        this.isExiting = false;
        this.inputDebounce = false;
        this.connectionFailureHandled = false;

        this.authFields = [
            { label: "Username", value: "", masked: false },
            { label: "Password", value: "", masked: true },
            { label: "Submit", type: "action" }
        ];

        this.settings = [
            { label: "Max Players", value: 32, max: 32, min: 2, type: "int" },
            { label: "Create Room", type: "action" }
        ];
        this.isEditing = false;

        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', this.handleInput.bind(this));
        process.stdout.on('resize', this.r.render.bind(this.r));
        
        process.on('SIGINT', async () => await this.exit());
        process.on('SIGTERM', async () => await this.exit());
        process.on('unhandledRejection', async () => await this.exit());
        process.on('uncaughtException', async () => await this.exit());

        this.bindEvents();
        this.r.render();
        this.init();
    };

    // lifecycle
    async init() {
        this.connectErr = false;
        this.connectErrReason = "";

        const status = await RelayAPI.ping();
        if (status.online === false) {
            this.connectErr = true;
            this.menu = "offline";
            if (status.message) this.connectErrReason = status.message;
            return this.r.render();
        };

        const hasSession = RelayAPI.loadSession();
        if (hasSession) {
            this.menu = "home";
            await RelayAPI.initSocket();
        }
        else this.menu = "login";

        this.r.render();
    };

    async exit() {
        if (this.isExiting) return;
        this.isExiting = true;

        if (this.messageTimeout) clearTimeout(this.messageTimeout);

        this.r.clearScreen();
        const showCursor = "\u001B[?25h";
        console.log(colours.fg.blue + `Exitting Standalone LC Relay Client...` + colours.reset + showCursor);
        
        VLANRelay.stop();
        await RelayAPI.exit(this.roomCode);
        process.exit(0);
    };

    bindEvents() {
        RelayAPI.on("connected", () => {
            this.connectionFailureHandled = false;
        });

        RelayAPI.on("player_joined", (player) => {
            if (this.isExiting) return;
            if (this.menu === "room") {
                const exists = this.state.players.some(p => p.id === player.id);
                if (!exists) {
                    this.state.players.push(player);
                    this.r.render();
                };
            };
        });

        RelayAPI.on("player_left", (player) => {
            if (this.isExiting) return;
            if (this.menu === "room") {
                const index = this.state.players.findIndex(p => p.id === player.id);
                if (index !== -1) {
                    this.state.players.splice(index, 1);
                    
                    if (this.focusIndex >= this.state.players.length) this.focusIndex = Math.max(0, this.state.players.length - 1);
                    
                    this.r.render();
                };
            };
        });

        RelayAPI.on("room_closed", (data) => {
            if (this.isExiting) return;
            if (this.menu === "room") this.handleClose(data?.reason || "The host left, the room has closed");
        });

        RelayAPI.on("room_kicked", (data) => {
            if (this.isExiting) return;
            if (this.menu === "room") this.handleClose(data?.reason || "You have been kicked from the room!");
        });

        RelayAPI.on("disconnected", (data) => {
            if (this.isExiting) return;
            if (this.menu === "room") this.handleClose("Connection to LC Relay lost", "init"); // idc if they are on main menu, also causes bug
        });

        RelayAPI.on("connect_error", (data) => {
            if (this.isExiting) return;

            if (this.connectionFailureHandled) return;
            this.connectionFailureHandled = true;

            if (!RelayAPI.user) return;

            this.handleClose("Failed to connect to LC Relay, login again", "login");
        });
    };

    // input and logic
    async handleInput(key) {
        if (this.inputDebounce && !["login", "signup", "join"].includes(this.menu)) return; // ignore debounce on menu list

        const char = key.toString();

        if (char === '\u0003' || (char === '\u001b' && (this.menu === "home" || this.menu === "offline" || this.menu === "login" || this.menu === "signup"))) {
            await this.exit();
        };

        if (char === '\u001b' && (this.menu !== "home" && this.menu !== "message" && this.menu !== "login" && this.menu !== "signup")) { // go back
            this.focusIndex = 0;
            this.isEditing = false;

            if (this.connectErr) this.menu = "offline";
            else this.menu = "home";
            if (this.state.inRoom) await this.leaveRoom();
        }

        else if (this.menu === "login" || this.menu === "signup") {
            const currentField = this.authFields[this.focusIndex];

            if (this.menu === "login" && char === '\t') { 
                this.menu = "signup";

                this.authFields[0].value = "";
                this.authFields[1].value = "";
                this.focusIndex = 0;
                return this.r.render();
            } else if (this.menu === "signup" && char === '\t') { 
                this.menu = "login";
                
                this.authFields[0].value = "";
                this.authFields[1].value = "";
                this.focusIndex = 0;
                return this.r.render();
            };

            if (char === "\u001b[A" && this.focusIndex > 0) { // up arr
                this.focusIndex--;
            } else if (char === "\u001b[B" && this.focusIndex < this.authFields.length - 1) { // down arr
                this.focusIndex++;
            } else if (char === '\r') { // enter
                if (currentField.type === "action") {
                    this.focusIndex = 0;
                    this.submitAuth();
                } else {
                    this.focusIndex = (this.focusIndex + 1) % this.authFields.length;
                };
            } else if (char === '\x7f' || char === '\x08') { // del
                if (currentField.type !== "action") currentField.value = currentField.value.slice(0, -1);
            } else {
                if (currentField.type !== "action" && char.length === 1 && /^[A-Za-z0-9._]$/.test(char) && currentField.value.length < 20) currentField.value += char;
            };
        } else if (this.menu === "home") { // home menu
            if (char === "\u001b[A" && this.focusIndex > 0) this.focusIndex -= 1; // up arrow
            else if (char === "\u001b[B" && this.focusIndex < 3) this.focusIndex += 1; // 3 for max home menu possible options
            else if (char === '\r') { // enter key
                if (this.focusIndex === 0) this.menu = "join";
                else if (this.focusIndex === 1) {
                    this.focusIndex = 0;
                    this.menu = "create";
                }
                else if (this.focusIndex === 2) this.menu = "about";
                else if (this.focusIndex === 3) this.handleLogout();
            };
        } else if (this.menu === "offline") { // offline home menu
            if (char === "\u001b[A" && this.focusIndex > 0) this.focusIndex -= 1; // up arrow
            else if (char === "\u001b[B" && this.focusIndex < 1) this.focusIndex += 1; // 1 for max offline home menu possible options
            else if (char === '\r') { // enter key
                if (this.focusIndex === 0) this.retryConnection();
                else if (this.focusIndex === 1) this.menu = "about";
            };
        } else if (this.menu === "join") { // join menu
            if (char === '\x7f' || char === '\x08') this.roomCode = this.roomCode.slice(0, -1);
            else if ((char === '\r' || char === '\n') && this.roomCode.length >= 5) {
                if (this.roomCode === "") this.menu = "home";
                else this.joinRoom(this.roomCode);
            }
            else {
                const sanitisedChars = char.toUpperCase().replace(/[^A-Z0-9]/g, "");
                if (sanitisedChars.length > 0) this.roomCode = (this.roomCode + sanitisedChars).slice(0, 6);
            };
        } else if (this.menu === "create") {
            const selected = this.settings[this.focusIndex];

            if (this.isEditing) {
                if (char === "\u001b[A" || char === "\u001b[C") {
                    if (selected.type === "int" && selected.value < selected.max) selected.value++;
                    if (selected.type === "bool") selected.value = true;
                    if (selected.type === "enum") {
                        const idx = selected.options.indexOf(selected.value);
                        selected.value = selected.options[(idx + 1) % selected.options.length];
                    };
                } else if (char === "\u001b[B" || char === "\u001b[D") {
                    if (selected.type === "int" && selected.value > selected.min) selected.value = Math.max(1, selected.value - 1);
                    if (selected.type === "bool") selected.value = false;
                    if (selected.type === "enum") {
                        const idx = selected.options.indexOf(selected.value);
                        selected.value = selected.options[(idx - 1 + selected.options.length) % selected.options.length];
                    };
                } else if (char === '\r') {
                    this.isEditing = false;
                };
            } else {
                if (char === "\u001b[A" && this.focusIndex > 0) this.focusIndex--;
                else if (char === "\u001b[B" && this.focusIndex < this.settings.length - 1) this.focusIndex++;
                else if (char === '\r') {
                    if (selected.label === "Create Room") {
                        this.createRoom({
                            maxPlayers: this.settings.find(s => s.label === "Max Players").value
                        });
                    } else {
                        this.isEditing = true;
                    };
                };
            };
        } else if (this.menu === "about") { // about menu
            if (char === "d") Utils.openUrl("https://discord.gg/ZZgcw4U7UK");
            else if (char === "g") Utils.openUrl("https://github.com/thehuckledev");
            else if (char === "w") Utils.openUrl("https://huckle.dev");
        } else if (this.menu === "room") { // room menu
            const totalPlayers = this.state.players.length;
            const termHeight = process.stdout.rows || 25;
            let playersPerChunk = Math.max(termHeight - 3 - 7, 4); // 3 for the footer and empty line, 7 for the header
            
            if (char === "\u001b[A" && this.focusIndex > 0) { // up arrow
                this.focusIndex -= 1;
            }
            else if (char === "\u001b[B" && this.focusIndex < this.state.players.length - 1) { // down arrow
                this.focusIndex += 1;
            }
            else if (char === "\u001b[C") { // right
                const target = this.focusIndex + playersPerChunk;
                if (target < totalPlayers) this.focusIndex = target;
            }
            else if (char === "\u001b[D") { // left
                const target = this.focusIndex - playersPerChunk;
                if (target >= 0) this.focusIndex = target;
            }
            if (char === '\x7f' || char === 'k') { // k
                const targetPlayer = this.state.players[this.focusIndex];
                if (!targetPlayer.isMe) this.kickPlayer(targetPlayer.id);
            };
            if (char === 'b') { // b
                const targetPlayer = this.state.players[this.focusIndex];
                if (!targetPlayer.isMe) this.banPlayer(targetPlayer.id);
            };
        };

        this.inputDebounce = true;
        setTimeout(() => {
            this.inputDebounce = false;
        }, 150);

        this.r.render();
    };

    async submitAuth() {
        const user = this.authFields[0].value.trim();
        const pass = this.authFields[1].value;

        if (!user || !pass) {
            const prevMenu = this.menu;
            return this.r.showMessage("You must enter your Username and Password", prevMenu, 1500);
        };

        const prevMenu = this.menu;
        this.r.showMessage(this.menu === "login" ? "Logging in..." : "Signing up...");

        if (prevMenu === "login") {
            const res = await RelayAPI.login(user, pass);

            if (res.success) {
                this.menu = "home";
                this.focusIndex = 0;
                this.r.render();
            } else {
                this.r.showMessage(res.message || "Invalid Username or Password", "login", 1500);
            };
        } else {
            const res = await RelayAPI.signup(user, pass);
            if (res.success) {
                this.authFields[0].value = "";
                this.authFields[1].value = "";
                this.focusIndex = 0;

                this.r.showMessage("Signup successful, you need to login", "login", 1500);
            } else {
                this.r.showMessage(res.message || "Signup failed", "signup", 1500);
            };
        };
    };

    async handleLogout() {
        this.r.showMessage("Logging out...");

        await RelayAPI.logout();

        this.authFields[0].value = "";
        this.authFields[1].value = "";
        this.focusIndex = 0;
        this.menu = "login";
        this.r.render();
    };

    async createRoom(settings) {
        this.screenMsg = "Creating room...";
        this.menu = "message";
        this.settings = [
            { label: "Max Players", value: 32, max: 32, min: 2, type: "int" },
            { label: "Create Room", type: "action" }
        ];
        this.isEditing = false;
        this.r.render();

        try {
            const response = await RelayAPI.createRoom(settings);
            
            if (response.success) {
                this.roomCode = response.code;
                this.state.players = response.players;
                this.state.inRoom = true;
                this.state.settings = response.settings;

                await VLANRelay.start({ isHost: true });

                this.menu = "room";
                this.focusIndex = 0;
                this.r.render();
            } else {
                this.r.showMessage(response.message || "Failed to create room", "create", 2000);
            };
        } catch (err) {
            this.r.showMessage("Error connecting to server", "create", 2000);
        };
    };

    async joinRoom(code) {
        this.r.showMessage("Connecting to Room...");

        try {
            const response = await RelayAPI.joinRoom(code);
            if (response.success) {
                this.state.players = response.players;
                this.state.inRoom = true;
                this.state.settings = response.settings;

                await VLANRelay.start({ isHost: false });

                this.focusIndex = 0;
                this.menu = "room";
                this.r.render();
            } else {
                this.r.showMessage(response.message || "Failed to join room", "join", 2000);
            };
        } catch (err) {
            this.r.showMessage("Error connecting to server", "join", 2000);
        };
    };

    async kickPlayer(playerID) {
        this.r.showMessage("Kicking Player...");

        const response = await RelayAPI.kickPlayer(this.roomCode, playerID);
        if (response.success) {
            this.state.players = this.state.players.filter(p => p.id !== playerID);
            this.menu = "room";
            this.r.render();
        } else {
            this.r.showMessage(response.message || "Failed to kick player", "room", 1000);
        };
    };

    async banPlayer(playerID) {
        this.r.showMessage("Banning Player...");

        const response = await RelayAPI.banPlayer(this.roomCode, playerID);
        if (response.success) {
            this.state.players = this.state.players.filter(p => p.id !== playerID);
            this.menu = "room";
            this.r.render();
        } else {
            this.r.showMessage(response.message || "Failed to ban player", "room", 1000);
        };
    };

    async leaveRoom() {
        this.r.showMessage("Leaving the room...");

        this.state.players = [];
        this.state.settings = {};
        this.state.inRoom = false;
        this.focusIndex = 0;

        VLANRelay.stop();

        try {
            const response = await RelayAPI.leaveRoom(this.roomCode);
            if (response.success) {
                this.menu = "home";
                this.roomCode = "";
                this.r.render();
            } else {
                this.roomCode = "";
                this.r.showMessage(response.message || "Failed to leave room, are you sure you are connected to the internet?", "home", 2000);
            };
        } catch (err) {
            this.r.showMessage("Error connecting to server", "home", 2000);
        };
    };

    retryConnection() {
        this.r.showMessage("Connecting to LC Relay...");

        setTimeout(async () => {
            if (this.isExiting) return;
            
            this.screenMsg = "";
            this.init();
        }, 1000);
    };

    handleClose(reason, roomShown = "home") {
        if (this.closeTimeout) clearTimeout(this.closeTimeout);

        this.r.showMessage(reason || "The connection was closed");

        VLANRelay.stop();

        this.state.players = [];
        this.state.settings = {};
        this.state.inRoom = false;
        this.focusIndex = 0;
        this.roomCode = "";
        
        this.closeTimeout = setTimeout(() => {
            if (roomShown === "init") {
                this.init();
            } else {
                this.menu = roomShown;
                this.r.render();
            };
        }, 3000);
    };
};

module.exports = TUI;
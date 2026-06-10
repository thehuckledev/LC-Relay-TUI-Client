let serverSecure = true;
let serverBase = "lc-relay-test.huckle.dev";
let relayPort = 61000; // do not use 25565 as if someone has 2 clients open they cant start local world
let hostRelayPort = 25565;

if (process.argv[2]) serverBase = process.argv[2];
if (process.argv[3]) serverSecure = process.argv[3].toLowerCase() === "true";
if (process.argv[4]) {
    const parsedPort = parseInt(process.argv[4], 10);
    if (!isNaN(parsedPort)) relayPort = parsedPort;
};
if (process.argv[5]) {
    const parsedPort = parseInt(process.argv[5], 10);
    if (!isNaN(parsedPort)) hostRelayPort = parsedPort;
};

const protocol = serverSecure ? "https" : "http";
const wsProtocol = serverSecure ? "wss" : "ws";

const wsBase = `${wsProtocol}://${serverBase}`;
const apiBase = `${protocol}://${serverBase}/v1`;

module.exports = {
    relayPort,
    hostRelayPort,
    wsBase,
    apiBase
};
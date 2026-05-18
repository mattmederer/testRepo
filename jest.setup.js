// Jest setup: expose Node's TextEncoder/TextDecoder as globals so that
// jest-environment-jsdom (which uses whatwg-url internally) can find them.
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

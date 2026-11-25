// The app shares the Depot logic in ../src/lib with the web app (imported as @core/...),
// so Metro also watches that folder.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../src/lib")];

module.exports = config;

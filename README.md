# roku-debug
A [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/) server (for editors like VSCode) and a socket adapter for Roku's [BrightScript Debug Protocol](https://developer.roku.com/en-ca/docs/developer-program/debugging/socket-based-debugger.md)

[![build status](https://img.shields.io/github/actions/workflow/status/rokucommunity/roku-debug/build.yml?branch=master)](https://github.com/rokucommunity/roku-debug/actions?query=branch%3Amaster+workflow%3Abuild)
[![coverage status](https://img.shields.io/coveralls/github/rokucommunity/roku-debug?logo=coveralls)](https://coveralls.io/github/rokucommunity/roku-debug?branch=master)
[![monthly downloads](https://img.shields.io/npm/dm/roku-debug.svg?sanitize=true&logo=npm&logoColor=)](https://npmcharts.com/compare/roku-debug?minimal=true)
[![npm version](https://img.shields.io/npm/v/roku-debug.svg?logo=npm)](https://www.npmjs.com/package/roku-debug)
[![license](https://img.shields.io/github/license/rokucommunity/roku-debug.svg)](LICENSE)
[![Slack](https://img.shields.io/badge/Slack-RokuCommunity-4A154B?logo=slack)](https://join.slack.com/t/rokudevelopers/shared_invite/zt-4vw7rg6v-NH46oY7hTktpRIBM_zGvwA)

## Usage
This project can be integrated with any IDE that supports the debug-adapter-protocol. 

**Known integrations:**
- [BrightScript Language extension for VSCode](https://github.com/rokucommunity/vscode-brightscript-language)
- [nvim-dap extension for Neovim](https://github.com/mfussenegger/nvim-dap/wiki/Debug-Adapter-installation#brightscript)

## DAP instructions
To run the language server standalone, you simply need to:
- install nodejs and make sure npx is on your path
- install this project (`npm install roku-debug`)
- run the project in dap mode (`npx roku-debug --dap`)

## Changelog
Click [here](CHANGELOG.md) to view the changelog

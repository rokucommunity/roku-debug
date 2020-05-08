# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## Unreleased
### Changed
 - brightscript debug commands from the debug console in the telnet adapter like `cont` and `step` are now supported.



## [0.3.6] - 2020-04-16
### Fixed
 - bug in socket debugger that would randomly try and run the `verifyHandshake()` method more than once during startup.



## [0.3.5] - 2020-04-10
### Changed
 - upgraded to [roku-deploy@3.0.2](https://www.npmjs.com/package/roku-debug/v/0.3.4) which fixed a file copy bug in subdirectories of symlinked folders



## [0.3.4] - 2020-04-07
### Changed
 - renamed `enableSocketDebugger` to `enableDebugProtocol`
### Fixed
 - Bug in the telnet debugger on windows devices that would crash the debug session when `stopOnEntry` was enabled.



[0.3.6:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v0.3.5...v0.3.6
[0.3.5]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v0.3.4...v0.3.5
[0.3.4]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v0.1.0...v0.3.4
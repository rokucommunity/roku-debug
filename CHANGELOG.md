# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## [0.9.2](https://github.com/rokucommunity/roku-debug/compare/v0.9.1...v0.9.2) - 2022-01-12
### Fixed
 - bug with telnet debug session related to fire-and-forget commands like `step`, `continue`, etc. This was causing the debug session to stall frequently. ([#64](https://github.com/rokucommunity/roku-debug/pull/64))
 - combine telnet output that was split due to buffer sizes ([#64](https://github.com/rokucommunity/roku-debug/pull/64))



## [0.9.1](https://github.com/rokucommunity/roku-debug/compare/v0.9.0...v0.9.1) - 2022-01-05
### Fixed
 - issue where `"consoleOutput": "full"` shows no output when `enableDebugProtocol === true`. ([#65](https://github.com/rokucommunity/roku-debug/pull/65))



## [0.9.0](https://github.com/rokucommunity/roku-debug/compare/v0.8.7...v0.9.0) - 2021-12-17
### Added
 - use @rokucommunity/logger package for logging. Adds many new log messages at various debug levels. ([#61](https://github.com/rokucommunity/roku-debug/pull/61))
    - add `logLevel` launch configuration variable
 - Ability to inspect node children through the `[[children]]` virtual property ([#57](https://github.com/rokucommunity/roku-debug/pull/57))
 - `[[length]]` virtual property for all variables that support it.  ([#57](https://github.com/rokucommunity/roku-debug/pull/57))
### Fixed
 - Several telnet debugging issues related to the 10.5 Roku OS release. ([#57](https://github.com/rokucommunity/roku-debug/pull/57))



## [0.8.7](https://github.com/rokucommunity/roku-debug/compare/v0.8.6...v0.8.7) - 2021-11-11
### Changed
 - added lots of logging for help troubleshooting issues in roku-debug. ([#56](https://github.com/rokucommunity/roku-debug/pull/56))
### Fixed
 - Don't delete dev channel during launch, as this clears the registry. ([#58](https://github.com/rokucommunity/roku-debug/pull/58))



## [0.8.6](https://github.com/rokucommunity/roku-debug/compare/v0.8.5...v0.8.6) - 2021-11-04
### Changed
 - upgrade to  [roku-deploy@3.5.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#352---2021-11-02) which fixed bugs introduced in roku-deploy v3.5.0.
### Fixed
 - telnet debugger to work better with RokuOS 10.5 and `run_as_process=1` projects, as well as some better detection of the `Brightscript Debugger>` prompt.
 - fix ECP commands that would fail when using a hostname instead of an ip address.



## [0.8.7](https://github.com/RokuCommunity/roku-debug/compare/v0.8.4...v0.8.5) - 2021-10-27
### Changed
 - additional logging to the "BrightScript Debug Server" output panel
 - upgrade to  [roku-deploy@3.5.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#350---2021-10-27)  which adds the ability to use negated non-rootDir top-level 
### Fixed
 - bug with boxed primitives for telnet debugger ([#36](https://github.com/rokucommunity/roku-debug/pull/36))
 - send stdio lines as separate debug events which fixes focus bug in the output panel. ([#51](https://github.com/rokucommunity/roku-debug/pull/51))
 - retain newlines in log output after tracker preprocessing ([#50](https://github.com/rokucommunity/roku-debug/pull/50))



## [0.8.4](https://github.com/RokuCommunity/roku-debug/compare/v0.8.3...v0.8.4) - 2021-06-01
### Fixed
 - debugger freeze when debugger prompt split across multiple telnet messages ([#35](https://github.com/rokucommunity/roku-debug/pull/35))



## [0.8.3](https://github.com/RokuCommunity/roku-debug/compare/v0.8.2...v0.8.3) - 2021-06-01
### Changed
 - upgraded to [roku-deploy@3.4.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#341---2021-06-01) which fixes bugs introduced in roku-deploy@3.4.0



## [0.8.2](https://github.com/RokuCommunity/roku-debug/compare/v0.8.1...v0.8.2) - 2021-05-28
### Changed
 - upgraded to [roku-deploy@3.4.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#340---2021-05-28) which brings significant zip speed improvements



## [0.8.1](https://github.com/RokuCommunity/roku-debug/compare/v0.8.0...v0.8.1) - 2021-05-04
### Fixed
 - Fix incorrect sgnodes shell prompt matching string. ([#31](https://github.com/rokucommunity/roku-debug/pull/31))
 - Increase port 8080 commands max buffer size ([#31](https://github.com/rokucommunity/roku-debug/pull/31))



## [0.8.0](https://github.com/RokuCommunity/roku-debug/compare/v0.7.0...v0.8.0) - 2021-05-03
### Added
 - port 8080 command support ([#29](https://github.com/rokucommunity/roku-debug/pull/29))
### Fixed
 - issue where chanperf logs were not being detected ([#30](https://github.com/rokucommunity/roku-debug/pull/30))



## [0.7.0](https://github.com/RokuCommunity/roku-debug/compare/v0.6.0...v0.7.0) - 2021-04-27
### Added
 - support for inspecting roXmlElement ([#23](https://github.com/rokucommunity/roku-debug/pull/23))
 - support for capturing chanperf events ([#28](https://github.com/rokucommunity/roku-debug/pull/28))



## [0.6.0](https://github.com/RokuCommunity/roku-debug/compare/v0.5.10...v0.6.0) - 2021-03-09
### Added
 - rdb integration ([#25](https://github.com/rokucommunity/roku-debug/pull/25))



## [0.5.10](https://github.com/RokuCommunity/roku-debug/compare/v0.5.9...v0.5.10) - 2021-02-16
### Fixed
 - stack trace for brighterscript class methods appearing as `anon`



## [0.5.9](https://github.com/RokuCommunity/roku-debug/compare/v0.5.8...v0.5.9) - 2021-01-19
### Fixed
 - timing issue when shutting down debug session before the log processor has finish its job
 - off-by-one location of "compile errors" when device validates XML components
 - off-by-one code stepping with debug protocol
 - XML sourcemap resolution; follow mapped source even if we don't have a resolved mapping
 - errors being dropped when a "line" error is found
 - added extra XML error matching
 - filter out "generic XML error" on a file if a specific one was captured as well



## [0.5.8](https://github.com/RokuCommunity/roku-debug/compare/v0.5.7...v0.5.8) - 2020-10-23
### Fixed
 - bug when converting `$anon_###` function names into original function names that was using the wrong line number to look up the name. ([#21](https://github.com/rokucommunity/roku-debug/pull/21))



## [0.5.7](https://github.com/RokuCommunity/roku-debug/compare/v0.5.6...v0.5.7) - 2020-10-06
### Fixed
 - bug that was not passing in the `stagingFolderPath` property for the root project, and therefore incorrectly loading that value from `bsconfig.json` if it existed. ([#18](https://github.com/rokucommunity/roku-debug/pull/18))



## [0.5.6](https://github.com/RokuCommunity/roku-debug/compare/v0.5.5...v0.5.6) - 2020-09-30
### Fixed
 - bug that prevented component library debug sessions from launching.



## [0.5.5](https://github.com/RokuCommunity/roku-debug/compare/v0.5.4...v0.5.5) - 2020-09-28
### Fixed
 - bug in the component library bundling that was using the `src` instead of `dest` for finding the manifest path ([#15](https://github.com/rokucommunity/roku-debug/pull/15))



## [0.5.4](https://github.com/RokuCommunity/roku-debug/compare/v0.5.3...v0.5.4) - 2020-09-25
### Changed
 - fixed some false positive detections of `Can't continue` in the TelnetAdapter
 - fixed version comparision links in the changelogs



## [0.5.3](https://github.com/RokuCommunity/roku-debug/compare/v0.5.2...v0.5.3) - 2020-08-14
### Changed
 - upgraded to [roku-deploy@3.2.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#323---2020-08-14)
 - throw exception when copying to staging folder and `rootDir` does not exist in the file system
 - throw exception when zipping package and `${stagingFolder}/manifest` does not exist in the file system



## [0.5.2](https://github.com/RokuCommunity/roku-debug/compare/v0.5.1...v0.5.2) - 2020-07-14
### Changed
 - upgraded to [roku-deploy@3.2.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#322---2020-07-14)
### Fixed
 - bug when loading stagingFolderPath from `rokudeploy.json` or `bsconfig.json` that would cause an exception.



## [0.5.1](https://github.com/RokuCommunity/roku-debug/compare/v0.5.0...v0.5.1) - 2020-07-11
### Fixed
 - Prevent debug session crash if target breakpoint file doesn't exist. [#10](https://github.com/rokucommunity/roku-debug/pull/10)
  -Bug when converting source location to staging locations that incorrectly checked rootDir before sourceDirs. [#10](https://github.com/rokucommunity/roku-debug/pull/10)



## [0.5.0](https://github.com/RokuCommunity/roku-debug/compare/v0.4.0...v0.5.0)- 2020-07-06
### Added
 - support for inline values during a debug session. [#8](https://github.com/rokucommunity/roku-debug/pull/8)
### Fixed
 - Fixed bug when inspecting indexed variables that would always show the list or array itself when using the BrightScript debug protocol [#8](https://github.com/rokucommunity/roku-debug/pull/8)



## [0.4.0](https://github.com/RokuCommunity/roku-debug/compare/v0.3.7...v0.4.0)- 2020-07-02
### Changed
 - Try to look up original function names for anonymous functions in call stack [#6](https://github.com/rokucommunity/roku-debug/issues/6)



## [0.3.7](https://github.com/RokuCommunity/roku-debug/compare/v0.3.6...v0.3.7) - 2020-05-11
### Changed
 - upgraded to roku-deploy@3.1.1
 - brightscript debug commands from the debug console in the telnet adapter like `cont` and `step` are now supported (but use at your own risk as there are synchronization issues between the adapter and vscode sometimes)
 - source maps are now cached on launch to improve step speed.
### Fixed
 - issue that was treating logpoints like regular breakpoints
 - bugs when debugging files with sourcemaps. This still isn't perfect, as files with injected breakpoints will debug the staging file. However, files with maps that don't have breakpoints will be debuggable in the source file. Fix coming soon for the prior.
 - several bugs where the source locations and staging locations were not being computed properly, causing a poor debugging experience.
 - bugs related to sourcemaps not loading from the proper locations.
 - bug with circular dependencies in source maps (shouldn't ever actually exist, but at least we won't loop forever now)



## [0.3.6](https://github.com/RokuCommunity/roku-debug/compare/v0.3.5...v0.3.6) - 2020-04-16
### Fixed
 - bug in socket debugger that would randomly try and run the `verifyHandshake()` method more than once during startup.



## [0.3.5](https://github.com/RokuCommunity/roku-debug/compare/v0.3.4...v0.3.5) - 2020-04-10
### Changed
 - upgraded to [roku-deploy@3.0.2](https://www.npmjs.com/package/roku-debug/v/0.3.4) which fixed a file copy bug in subdirectories of symlinked folders



## [0.3.4](https://github.com/RokuCommunity/roku-debug/compare/v0.3.3...v0.3.4) - 2020-04-07
### Changed
 - renamed `enableSocketDebugger` to `enableDebugProtocol`
### Fixed
 - Bug in the telnet debugger on windows devices that would crash the debug session when `stopOnEntry` was enabled.

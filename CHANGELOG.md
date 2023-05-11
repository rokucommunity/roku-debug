# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## [0.18.9](https://github.com/rokucommunity/roku-debug/compare/v0.18.8...v0.18.9) - 2023-05-10
### Changed
 - upgrade to [brighterscript@0.64.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0644---2023-05-10)
 - upgrade to [roku-deploy@3.10.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3102---2023-05-10). Notable changes since 3.10.1:
     - Fix audit issues ([roku-deploy#116](https://github.com/rokucommunity/roku-deploy/pull/116))
     - fix nodejs 19 bug ([roku-deploy#115](https://github.com/rokucommunity/roku-deploy/pull/115))



## [0.18.8](https://github.com/rokucommunity/roku-debug/compare/v0.18.7...v0.18.8) - 2023-04-28
### Changed
 - Make axios a prod dependency ([#148](https://github.com/rokucommunity/roku-debug/pull/148))



## [0.18.7](https://github.com/rokucommunity/roku-debug/compare/v0.18.6...v0.18.7) - 2023-04-28
### Added 
 - better error for failed session starts ([#147](https://github.com/rokucommunity/roku-debug/pull/147))
 - adds device-info query results to debug session ([#130](https://github.com/rokucommunity/roku-debug/pull/130))
### Changed
 - Bump xml2js from 0.4.23 to 0.5.0 ([#146](https://github.com/rokucommunity/roku-debug/pull/146))
 - upgrade to [brighterscript@0.64.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0643---2023-04-28). Notable changes since 0.64.2:
     - Improves performance in symbol table fetching ([brighterscript#797](https://github.com/rokucommunity/brighterscript/pull/797))



## [0.18.6](https://github.com/rokucommunity/roku-debug/compare/v0.18.5...v0.18.6) - 2023-04-18
### Changed
 - Exclude sourcemaps when sideloading ([#145](https://github.com/rokucommunity/roku-debug/pull/145))
 - upgrade to [brighterscript@0.64.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0642---2023-04-18). Notable changes since 0.64.1:
     - Fix namespace-relative enum value ([brighterscript#793](https://github.com/rokucommunity/brighterscript/pull/793))



## [0.18.5](https://github.com/rokucommunity/roku-debug/compare/v0.18.4...v0.18.5) - 2023-04-14
### Changed
 - upgrade to [brighterscript@0.64.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0641---2023-04-14). Notable changes since 0.62.0:
     - Bump xml2js from 0.4.23 to 0.5.0 ([brighterscript#790](https://github.com/rokucommunity/brighterscript/pull/790))
 - upgrade to [roku-deploy@3.10.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3101---2023-04-14). Notable changes since 3.10.0:
     - Bump xml2js from 0.4.23 to 0.5.0 ([roku-deploy#112](https://github.com/rokucommunity/roku-deploy/pull/112))



## [0.18.4](https://github.com/rokucommunity/roku-debug/compare/v0.18.3...v0.18.4) - 2023-03-17
### Changed
 - upgrade to [brighterscript@0.62.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0620---2023-03-17). Notable changes since 0.61.3:
     - Fix crash when func has no block ([brighterscript#774](https://github.com/rokucommunity/brighterscript/pull/774))
     - Move not-referenced check into ProgramValidator ([brighterscript#773](https://github.com/rokucommunity/brighterscript/pull/773))
 - upgrade to [@rokucommunity/logger@0.3.2](https://github.com/rokucommunity/logger/blob/master/CHANGELOG.md#032---2023-03-16). Notable changes since 0.3.1:
     - Fix crash when encountering bigint ([@rokucommunity/logger#3](https://github.com/rokucommunity/logger/pull/3))
 - upgrade to [roku-deploy@3.10.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3100---2023-03-16). Notable changes since 3.9.3:
     - Use micromatch instead of picomatch ([roku-deploy#109](https://github.com/rokucommunity/roku-deploy/pull/109))



## [0.18.3](https://github.com/rokucommunity/roku-debug/compare/v0.18.2...v0.18.3) - 2023-01-31
### Fixed
 - Increase the timeout for debug protocol control to prevent timeout with large projects ([#134](https://github.com/rokucommunity/roku-debug/pull/134))



## [0.18.2](https://github.com/rokucommunity/roku-debug/compare/v0.18.1...v0.18.2) - 2023-01-27
### Fixed
 - off-by-1 bug with threads over protocol ([#132](https://github.com/rokucommunity/roku-debug/pull/132))



## [0.18.1](https://github.com/rokucommunity/roku-debug/compare/v0.18.0...v0.18.1) - 2023-01-24
### Changed
 - Hide debugger-created temp variables from the variables panel, add `showHiddenVariables` flag to disable it if desired. ([#127](https://github.com/rokucommunity/roku-debug/pull/127))
 - upgrade to [brighterscript@0.61.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0613---2023-01-12). Notable changes since 0.61.2:
 - upgrade to [@rokucommunity/logger@0.3.1](https://github.com/rokucommunity/logger/blob/master/CHANGELOG.md#031---2023-01-24). Notable changes since 0.3.0:
### Fixed
 - `isAssignableExpression` to correctly support `DottedSet` and `IndexedSet` statements ([#128](https://github.com/rokucommunity/roku-debug/pull/128))



## [0.18.0](https://github.com/rokucommunity/roku-debug/compare/v0.17.3...v0.18.0) - 2023-01-12
### Added
 - Execute command for repl expressions ([#119](https://github.com/rokucommunity/roku-debug/pull/119))
### Changed
 - upgrade to [roku-deploy@3.9.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#393---2023-01-12)
### Fixed
 - inifinite spin for unloaded vars ([#120](https://github.com/rokucommunity/roku-debug/pull/120))



## [0.17.3](https://github.com/rokucommunity/roku-debug/compare/v0.17.2...v0.17.3) - 2022-12-15
### Added
 - Debug protocol breakpoint verification ([#117](https://github.com/rokucommunity/roku-debug/pull/117))



## [0.17.2](https://github.com/rokucommunity/roku-debug/compare/v0.17.1...v0.17.2) - 2022-12-15
### Changed
 - upgrade to [brighterscript@0.61.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0612---2022-12-15). Notable changes since 0.61.1:
     - Bump qs from 6.5.2 to 6.5.3 ([brighterscript#758](https://github.com/rokucommunity/brighterscript/pull/758))



## [0.17.1](https://github.com/rokucommunity/roku-debug/compare/v0.17.0...v0.17.1) - 2022-12-08
### Fixed
 - Fix "continue" repeat bug in protocol adapter ([#114](https://github.com/rokucommunity/roku-debug/pull/114))
 - Fix issue with truncated debugger paths ([#113](https://github.com/rokucommunity/roku-debug/pull/113))
 - Bugfix/do not alter `outFilePath` for libraries ([#112](https://github.com/rokucommunity/roku-debug/pull/112))
 - upgrade to [brighterscript@0.61.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0611---2022-12-07)



## [0.17.0](https://github.com/rokucommunity/roku-debug/compare/v0.16.1...v0.17.0) - 2022-11-02
### Changed
 - Added the `brightscript_warnings` command ([#110](https://github.com/rokucommunity/roku-debug/pull/110))



## [0.16.1](https://github.com/rokucommunity/roku-debug/compare/v0.16.0...v0.16.1) - 2022-10-28
### Changed
 - upgrade to [brighterscript@0.60.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0604---2022-10-28). Notable changes since 0.60.0:
     - Allow `continue` as local var ([brighterscript#730](https://github.com/rokucommunity/brighterscript/pull/730))
     - better parse recover for unknown func params ([brighterscript#722](https://github.com/rokucommunity/brighterscript/pull/722))
     - Fix if statement block var bug ([brighterscript#698](https://github.com/rokucommunity/brighterscript/pull/698))



## [0.16.0](https://github.com/rokucommunity/roku-debug/compare/v0.15.0...v0.16.0) - 2022-10-17
### Changed
 - Emit device diagnostics instead of compile errors ([#104](https://github.com/rokucommunity/roku-debug/pull/104))
 - Standardize custom events, add is* helpers ([#103](https://github.com/rokucommunity/roku-debug/pull/103))
 - upgrade to [brighterscript@0.60.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0600---2022-10-10). Notable changes since 0.56.0:
 - upgrade to [roku-deploy@3.9.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#392---2022-10-03). Notable changes since 3.7.1:
     - Replace minimatch with picomatch ([roku-deploy#101](https://github.com/rokucommunity/roku-deploy/pull/101))
     - Sync retainStagingFolder, stagingFolderPath with options. ([roku-deploy#100](https://github.com/rokucommunity/roku-deploy/pull/100))
     - Add stagingDir and retainStagingDir. ([roku-deploy#99](https://github.com/rokucommunity/roku-deploy/pull/99))
     - Remotedebug connect early ([roku-deploy#97](https://github.com/rokucommunity/roku-deploy/pull/97))
     - Better compile error handling ([roku-deploy#96](https://github.com/rokucommunity/roku-deploy/pull/96))
### Fixed
 - crash in rendezvous parser for missing files ([#108](https://github.com/rokucommunity/roku-debug/pull/108))
 - better debug protocol launch handling ([#102](https://github.com/rokucommunity/roku-debug/pull/102))



## [0.15.0](https://github.com/rokucommunity/roku-debug/compare/v0.14.2...v0.15.0) - 2022-08-23
### Added
 - support for conditional breakpoints over the debug protocol([#97](https://github.com/rokucommunity/roku-debug/pull/97))
### Changed
- upgrade to [brighterscript@0.56.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0560---2022-08-23). Notable changes since 0.55.1:
     - Fix compile crash for scope-less files ([brighterscript#674](https://github.com/rokucommunity/brighterscript/pull/674))
     - Allow const as variable name ([brighterscript#670](https://github.com/rokucommunity/brighterscript/pull/670))
### Fixed
 - `stopOnEntry` bug with `deepLinkUrl`. ([#100](https://github.com/rokucommunity/roku-debug/pull/100))
 - bug that was omitting `invalid` data types over the debug protocol ([#99](https://github.com/rokucommunity/roku-debug/pull/99))
 


## [0.14.2](https://github.com/rokucommunity/roku-debug/compare/v0.14.1...v0.14.2) - 2022-08-12
### Changed
 - Support complib breakpoints on 11.5.0 ([#96](https://github.com/rokucommunity/roku-debug/pull/96))
 - Disable thread hopping workaround >= protocol v3.1.0 ([#95](https://github.com/rokucommunity/roku-debug/pull/95))
 - Upload zip and connect to protocol socket in parallel ([#94](https://github.com/rokucommunity/roku-debug/pull/94))
 - upgrade to [brighterscript@0.55.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0551---2022-08-07). Notable changes since 0.53.1:
     - Fix typescript error for ast parent setting ([brighterscript#659](https://github.com/rokucommunity/brighterscript/pull/659))
     - Performance boost: better function sorting during validation ([brighterscript#651](https://github.com/rokucommunity/brighterscript/pull/651))
     - Export some vscode interfaces ([brighterscript#644](https://github.com/rokucommunity/brighterscript/pull/644))



## [0.14.1](https://github.com/rokucommunity/roku-debug/compare/v0.14.0...v0.14.1) - 2022-07-16
### Changed
 - Bump moment from 2.29.2 to 2.29.4 ([#92](https://github.com/rokucommunity/roku-debug/pull/92))
 - upgrade to [brighterscript@0.53.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0531---2022-07-15). Notable changes since 0.53.0:
     - Bump moment from 2.29.2 to 2.29.4 ([brighterscript#640](https://github.com/rokucommunity/brighterscript/pull/640))



## [0.14.0](https://github.com/rokucommunity/roku-debug/compare/v0.13.1...v0.14.0) - 2022-07-14
### Added
 - debug protocol: support for case-sensitivity in getVariables protocol request ([#91](https://github.com/rokucommunity/roku-debug/pull/91))
 - Show error when cannot resolve hostname ([#90](https://github.com/rokucommunity/roku-debug/pull/90))
### Changed
 - upgrade to [brighterscript@0.53.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0530---2022-07-14)



## [0.13.1](https://github.com/rokucommunity/roku-debug/compare/v0.13.0...v0.13.1) - 2022-06-09
### Fixed
 - dynamic breakpoints bug where component library breakpoints weren't being hit ([#89](https://github.com/rokucommunity/roku-debug/pull/89))



## [0.13.0](https://github.com/rokucommunity/roku-debug/compare/v0.12.2...v0.13.0) - 2022-06-08
### Added
 - Support for dynamic breakpoints when using Debug Protocol ([#84](https://github.com/rokucommunity/roku-debug/pull/84))
### Changed
 - upgrade to [brighterscript@0.52.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0520---2022-06-08)
 - upgrade to [roku-deploy@3.7.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#371---2022-06-08)
### Fixed
 - crash when RAF files show up in stacktrace ([#88](https://github.com/rokucommunity/roku-debug/pull/88))



## [0.12.2](https://github.com/rokucommunity/roku-debug/compare/v0.12.1...v0.12.2) - 2022-05-31
### Changed
 - upgrade to [brighterscript@0.51.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0513---2022-05-31)
 - upgrade to [roku-deploy@3.7.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#370---2022-05-23)
### Fixed
 - line number and thread hopping fixes ([#86](https://github.com/rokucommunity/roku-debug/pull/86))



## [0.12.1](https://github.com/rokucommunity/roku-debug/compare/v0.12.0...v0.12.1) - 2022-05-20
### Changed
 - add `launchConfiguration` to the `ChannelPublishedEvent` ([#83](https://github.com/rokucommunity/roku-debug/pull/83))
 ### Fixed
 - crash during rendezvous tracking ([#82](https://github.com/rokucommunity/roku-debug/pull/82))



## [0.12.0](https://github.com/rokucommunity/roku-debug/compare/v0.11.0...v0.12.0) - 2022-05-17
### Added
 - `BSChannelPublishedEvent` custom event to allow clients to handle when the channel has been uploaded to a Roku ([#81](https://github.com/rokucommunity/roku-debug/pull/81))



## [0.11.0](https://github.com/rokucommunity/roku-debug/compare/v0.10.5...v0.11.0) - 2022-05-05
 ### Added
 - `brightScriptConsolePort` option. Utilize `remotePort` in more places ([#79](https://github.com/rokucommunity/roku-debug/pull/79))
 -basic breakpoint logic for debug protocol (only useful for direct API access at the moment) ([#77](https://github.com/rokucommunity/roku-debug/pull/77))
 ### Changed
 - upgrade to [brighterscript@0.49.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0490---2022-05-02)
### Fixed
 - fix RDB path bug on windows ([#76](https://github.com/rokucommunity/roku-debug/pull/76))




## [0.10.5](https://github.com/rokucommunity/roku-debug/compare/v0.10.4...v0.10.5) - 2022-04-13
### Changed
 - upgrade to [roku-deploy@3.6.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#360---2022-04-13)
 - upgrade to [brighterscript@0.48.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0480---2022-04-13)
   - language support for native BrightScript optional chaining ([#546](https://github.com/rokucommunity/brighterscript/pull/546))



## [0.10.4](https://github.com/rokucommunity/roku-debug/compare/v0.10.3...v0.10.4) - 2022-04-07
### Fixed
 - stability issues when restarting an existing debug session ([#74](https://github.com/rokucommunity/roku-debug/pull/74))



## [0.10.3](https://github.com/rokucommunity/roku-debug/compare/v0.10.2...v0.10.3) - 2022-04-07
### Changed
 - upgrade to [brighterscript@0.47.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0472---2022-04-07)
### Fixed
 - issue where the `type` and `keys` commands would time out. ([#73](https://github.com/rokucommunity/roku-debug/pull/73))
 - possible fix for [#72](https://github.com/rokucommunity/roku-debug/issues/72) ([#73](https://github.com/rokucommunity/roku-debug/pull/73))



## [0.10.2](https://github.com/rokucommunity/roku-debug/compare/v0.10.1...v0.10.2) - 2022-03-25
### Added
 - zip timing message during startup
### Fixed
 - bug with protocol step command killing the app ([#70](https://github.com/rokucommunity/roku-debug/pull/70))
 - event flow on protocol debugger startup ([#70](https://github.com/rokucommunity/roku-debug/pull/70))
 - Fix bug cleaning up packet lengths for v3 ([#70](https://github.com/rokucommunity/roku-debug/pull/70))



## [0.10.1](https://github.com/rokucommunity/roku-debug/compare/v0.10.0...v0.10.1) - 2022-03-17
### Changed
 - upgrade to  [roku-deploy@3.5.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#354---2022-03-17)
    - fixes significant performance issues during globbing. ([roku-deploy#86](https://github.com/rokucommunity/roku-deploy/pull/86))
 - upgrade to [brighterscript@0.5.6](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0456---2022-03-17)



## [0.10.0](https://github.com/rokucommunity/roku-debug/compare/v0.9.4...v0.10.0) - 2022-03-08
### Added
 - support for roku debug protocol v3.0.0
 - support for eval/execute functionality over the debug protocol(v3.0.0+) from the debug console
### Changed
 - running `print` statements in the debug console now runs an actual print statement. To do variable evaluation, simply type the name of the variable.



## [0.9.4](https://github.com/rokucommunity/roku-debug/compare/v0.9.3...v0.9.4) - 2022-02-24
### Changed
 - upgrade to [brighterscript@0.5.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0452---2022-02-24).



## [0.9.3](https://github.com/rokucommunity/roku-debug/compare/v0.9.2...v0.9.3) - 2022-01-28
### Changed
 - upgrade to [brighterscript@0.43.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0430---2022-01-28).



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

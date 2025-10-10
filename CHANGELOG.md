# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## [0.22.2](https://github.com/rokucommunity/roku-debug/compare/0.22.1...v0.22.2) - 2025-10-10
### Changed
 - upgrade to [brighterscript@0.70.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0702---2025-10-10). Notable changes since 0.70.1:
     - Add manual entries for roUtils and roRenderThreadQueue ([#1574](https://github.com/rokucommunity/roku-debug/pull/1574))
     - Roku sdk updates ([#1573](https://github.com/rokucommunity/roku-debug/pull/1573))



## [0.22.1](https://github.com/rokucommunity/roku-debug/compare/0.22.0...v0.22.1) - 2025-09-11
### Changed
 - upgrade to [brighterscript@0.70.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0701---2025-09-11). Notable changes since 0.70.0:



## [0.22.0](https://github.com/rokucommunity/roku-debug/compare/0.21.38...v0.22.0) - 2025-09-10
### Changed
 - Add more logs to track how long each step takes while sideloading ([#270](https://github.com/rokucommunity/roku-debug/pull/270))
 - upgrade to [brighterscript@0.70.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0700---2025-08-11). Notable changes since 0.69.13:
 - upgrade to [roku-deploy@3.13.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3130---2025-08-04). Notable changes since 3.12.6:
     - Add standards-compliant User-Agent header ([#203](https://github.com/rokucommunity/roku-debug/pull/203))
### Fixed
 - Better handling when the telnet debugger freezes ([#268](https://github.com/rokucommunity/roku-debug/pull/268))



## [0.21.38](https://github.com/rokucommunity/roku-debug/compare/0.21.37...v0.21.38) - 2025-08-04
### Changed
 - upgrade to [brighterscript@0.69.13](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06913---2025-08-04). Notable changes since 0.69.11:



## [0.21.37](https://github.com/rokucommunity/roku-debug/compare/0.21.36...v0.21.37) - 2025-07-03
### Changed
 - upgrade to [brighterscript@0.69.11](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06911---2025-07-03). Notable changes since 0.69.10:



## [0.21.36](https://github.com/rokucommunity/roku-debug/compare/0.21.35...v0.21.36) - 2025-06-03
### Changed
 - upgrade to [brighterscript@0.69.10](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06910---2025-06-03). Notable changes since 0.69.9:
 - upgrade to [roku-deploy@3.12.6](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3126---2025-06-03). Notable changes since 3.12.5:



## [0.21.35](https://github.com/rokucommunity/roku-debug/compare/0.21.34...v0.21.35) - 2025-05-30
### Removed
 - Removed `isClockValid` virtual variable ([#262](https://github.com/rokucommunity/roku-debug/pull/262))



## [0.21.34](https://github.com/rokucommunity/roku-debug/compare/0.21.33...v0.21.34) - 2025-05-12
### Changed
 - upgrade to [brighterscript@0.69.9](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0699---2025-05-09). Notable changes since 0.69.8:
     - removed no-throw-literal lint rule ([brighterscript#1489](https://github.com/rokucommunity/brighterscript/pull/1489))
     - Add `bsc0` cli binary name ([brighterscript#1490](https://github.com/rokucommunity/brighterscript/pull/1490))
### Fixed
 - Fix telnet-still-in-use issues ([#259](https://github.com/rokucommunity/roku-debug/pull/259))



## [0.21.33](https://github.com/rokucommunity/roku-debug/compare/0.21.32...v0.21.33) - 2025-05-05
### Changed
 - upgrade to [@rokucommunity/logger@0.3.11](https://github.com/rokucommunity/logger/blob/master/CHANGELOG.md#0311---2025-05-05). Notable changes since 0.3.10:
 - upgrade to [brighterscript@0.69.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0698---2025-05-05). Notable changes since 0.69.7:
 - upgrade to [roku-deploy@3.12.5](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3125---2025-05-05). Notable changes since 3.12.4:



## [0.21.32](https://github.com/rokucommunity/roku-debug/compare/0.21.31...v0.21.32) - 2025-04-25
### Changed
 - Force `allowHalfOpen` to false on all sockets ([#251](https://github.com/rokucommunity/roku-debug/pull/251))
 - Added better telnet socket in use detection ([#250](https://github.com/rokucommunity/roku-debug/pull/250))
 - upgrade to [brighterscript@0.69.7](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0697---2025-04-23). Notable changes since 0.69.6:
     - Prevent runtime crash for non-referencable funcs in ternary and null coalescing ([brighterscript#1474](https://github.com/rokucommunity/brighterscript/pull/1474))
     - Fix `removeParameterTypes` compile errors for return types ([brighterscript#1414](https://github.com/rokucommunity/brighterscript/pull/1414))



## [0.21.31](https://github.com/rokucommunity/roku-debug/compare/v0.21.30...v0.21.31) - 2025-04-10
### Changed
 - Updated usages of socket `addListener` to `on` ([#247](https://github.com/rokucommunity/roku-debug/pull/247))
 - Better logs around socket connections with the device ([#246](https://github.com/rokucommunity/roku-debug/pull/246))



## [0.21.30](https://github.com/rokucommunity/roku-debug/compare/v0.21.29...v0.21.30) - 2025-04-09
### Changed
 - Explicitly set the version of the package glob ([#244](https://github.com/rokucommunity/roku-debug/pull/244))
 - upgrade to [brighterscript@0.69.6](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0696---2025-04-09). Notable changes since 0.69.4:
     - Updated the type definition of the `InStr` global callable ([brighterscript#1456](https://github.com/rokucommunity/brighterscript/pull/1456))
     - More safely wrap expressions for template string transpile ([brighterscript#1445](https://github.com/rokucommunity/brighterscript/pull/1445))



## [0.21.29](https://github.com/rokucommunity/roku-debug/compare/v0.21.28...v0.21.29) - 2025-04-03
### Changed
 - (chore) migrate to shared CI ([#242](https://github.com/rokucommunity/roku-debug/pull/242))
 - upgrade to [@rokucommunity/logger@0.3.10](https://github.com/rokucommunity/logger/blob/master/CHANGELOG.md#0310---2025-03-26). Notable changes since 0.3.9:
     - Fixing issues before release 0.3.10 ([logger#d5babf1](https://github.com/rokucommunity/logger/commit/d5babf1))
     - Added the ability to turn off timestamps in the output and fixed a potental crash if the format string was empty ([logger#11](https://github.com/rokucommunity/logger/pull/11))
 - upgrade to [brighterscript@0.69.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0694---2025-03-31). Notable changes since 0.69.3:
     - Migration to the new shared CI ([brighterscript#1440](https://github.com/rokucommunity/brighterscript/pull/1440))
     - Support plugin factory detecting brighterscript version ([brighterscript#1438](https://github.com/rokucommunity/brighterscript/pull/1438))
### Fixed
 - launch crash race condition ([#241](https://github.com/rokucommunity/roku-debug/pull/241))


## [0.21.28](https://github.com/rokucommunity/roku-debug/compare/v0.21.27...v0.21.28) - 2025-03-20
### Changed
 - Limit the range of scopes ([#240](https://github.com/rokucommunity/roku-debug/pull/240))
 - Fixed some duplicate variable names on `roDateTime` ([#239](https://github.com/rokucommunity/roku-debug/pull/239))
 - upgrade to [brighterscript@0.69.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0693---2025-03-20). Notable changes since 0.69.2:
     - Fixed getClosestExpression bug to return undefined when position not found ([brighterscript#1433](https://github.com/rokucommunity/brighterscript/pull/1433))
     - Adds Alias statement syntax from v1 to v0 ([brighterscript#1430](https://github.com/rokucommunity/brighterscript/pull/1430))



## [0.21.27](https://github.com/rokucommunity/roku-debug/compare/v0.21.26...v0.21.27) - 2025-03-17
### Changed
 - Fixed `TelnetAdapter` reporting that it was a protocol adapter ([#237](https://github.com/rokucommunity/roku-debug/pull/237))



## [0.21.26](https://github.com/rokucommunity/roku-debug/compare/v0.21.25...v0.21.26) - 2025-03-13
### Changed
 - upgrade to [brighterscript@0.69.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0692---2025-03-13). Notable changes since 0.69.1:
     - Significantly improve the performance of standardizePath ([brighterscript#1425](https://github.com/rokucommunity/brighterscript/pull/1425))
     - Bump @babel/runtime from 7.24.5 to 7.26.10 ([brighterscript#1426](https://github.com/rokucommunity/brighterscript/pull/1426))
     - Backport v1 typecast syntax to v0 ([brighterscript#1421](https://github.com/rokucommunity/brighterscript/pull/1421))



## [0.21.25](https://github.com/rokucommunity/roku-debug/compare/v0.21.24...v0.21.25) - 2025-03-10
### Added
 - Add `hasFocus` and `isInFocusChain` virtual vars to nodes ([#234](https://github.com/rokucommunity/roku-debug/pull/234))
### Changed
 - upgrade to [brighterscript@0.69.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0691---2025-03-10). Notable changes since 0.69.0:
     - Prevent running the lsp project in a worker thread ([brighterscript#1423](https://github.com/rokucommunity/brighterscript/pull/1423))
### Fixed
 - Fix crash in bsc project when thread has error ([#235](https://github.com/rokucommunity/roku-debug/pull/235))



## [0.21.24](https://github.com/rokucommunity/roku-debug/compare/v0.21.23...v0.21.24) - 2025-02-21
### Changed
 - Rename `roAudioPlayerEvent` virtual vars, add missing `roChannelStoreEvent` virtual vars ([#230](https://github.com/rokucommunity/roku-debug/pull/230))
 - Add `$contents` virtual variable to `roRegistrySection` ([#231](https://github.com/rokucommunity/roku-debug/pull/231))
 - Temporary fix for virtual vars in hovers ([#232](https://github.com/rokucommunity/roku-debug/pull/232))
 - Removed the array virtual variables from list and xml list ([#229](https://github.com/rokucommunity/roku-debug/pull/229))



## [0.21.23](https://github.com/rokucommunity/roku-debug/compare/v0.21.22...v0.21.23) - 2025-02-19
### Changed
 - Cleaned up the scopes flows and added the ability to defer the loading of the local scope ([#227](https://github.com/rokucommunity/roku-debug/pull/227))
 - Removed the random `uuid` virtual variable from device info ([#228](https://github.com/rokucommunity/roku-debug/pull/228))



## [0.21.22](https://github.com/rokucommunity/roku-debug/compare/v0.21.21...v0.21.22) - 2025-02-17
### Changed
 - Bump serialize-javascript and mocha ([#224](https://github.com/rokucommunity/roku-debug/pull/224))
 - Centralize ECP request processing ([#225](https://github.com/rokucommunity/roku-debug/pull/225))
### Fixed
 - Fixed an issue where the entry breakpoint could be hit again by the end user if they manually restarted the app ([#226](https://github.com/rokucommunity/roku-debug/pull/226))



## [0.21.21](https://github.com/rokucommunity/roku-debug/compare/v0.21.20...v0.21.21) - 2025-02-13
### Fixed
 - Fixed a bug that preventing the `stopOnEntry` setting from being respected when restarting a debug session ([#223](https://github.com/rokucommunity/roku-debug/pull/223))
 - fixed missing `\n` characters in startup logs ([#222](https://github.com/rokucommunity/roku-debug/pull/222))



## [0.21.20](https://github.com/rokucommunity/roku-debug/compare/v0.21.19...v0.21.20) - 2025-02-10
### Added
 - Feature/registry scope in variables pannel ([#219](https://github.com/rokucommunity/roku-debug/pull/219))
### Changed
 - Updated the breakpoint manager to fail inline breakpoint requests ([#221](https://github.com/rokucommunity/roku-debug/pull/221))
 - upgrade to [brighterscript@0.69.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0690---2025-02-10). Notable changes since 0.68.5:
     - Language Server Rewrite ([brighterscript#993](https://github.com/rokucommunity/brighterscript/pull/993))
### Fixed
 - Bugfix/UI flicker on invalidated events ([#220](https://github.com/rokucommunity/roku-debug/pull/220))



## [0.21.19](https://github.com/rokucommunity/roku-debug/compare/v0.21.18...v0.21.19) - 2025-02-06
### Added
 - debugger completions in the REPL ([#211](https://github.com/rokucommunity/roku-debug/pull/211))
 - More completion trigger locations in the REPL ([#217](https://github.com/rokucommunity/roku-debug/pull/217))
### Changed
 - Sends the same start up logs for both debug console and output panel ([#218](https://github.com/rokucommunity/roku-debug/pull/218))
 - upgrade to [brighterscript@0.68.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0685---2025-02-06). Notable changes since 0.68.4:
     - Add `validate` flag to ProgramBuilder.run() ([brighterscript#1409](https://github.com/rokucommunity/brighterscript/pull/1409))



## [0.21.18](https://github.com/rokucommunity/roku-debug/compare/v0.21.17...v0.21.18) - 2025-01-31
### Fixed
 - Fix ecp limited crash ([#215](https://github.com/rokucommunity/roku-debug/pull/215))



## [0.21.17](https://github.com/rokucommunity/roku-debug/compare/v0.21.16...v0.21.17) - 2025-01-31
### Added
 - Add support for custom variables ([#209](https://github.com/rokucommunity/roku-debug/pull/209))
 - Convert pkg path to file system path in logs ([#208](https://github.com/rokucommunity/roku-debug/pull/208))
### Fixed
 - Fixed file path and unusable link issues on windows ([#213](https://github.com/rokucommunity/roku-debug/pull/213))
 - Fixed a bug where some logs could get lost by the debugger ([#212](https://github.com/rokucommunity/roku-debug/pull/212))
 - Fixed issue looking up primitive variables on hover ([#210](https://github.com/rokucommunity/roku-debug/pull/210))



## [0.21.16](https://github.com/rokucommunity/roku-debug/compare/v0.21.15...v0.21.16) - 2025-01-22
### Changed
 - Uninitialize __brs_err__ when stepping or continuing ([#207](https://github.com/rokucommunity/roku-debug/pull/207))
 - upgrade to [brighterscript@0.68.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0684---2025-01-22)
 - upgrade to [roku-deploy@3.12.4](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3124---2025-01-22). Notable changes since 3.12.3:
     - fixed an issue with 577 error codes ([roku-deploy#182](https://github.com/rokucommunity/roku-deploy/pull/182))



## [0.21.15](https://github.com/rokucommunity/roku-debug/compare/v0.21.14...v0.21.15) - 2025-01-13
### Fixed
 - Better handling of split log messages ([#206](https://github.com/rokucommunity/roku-debug/pull/206))



## [0.21.14](https://github.com/rokucommunity/roku-debug/compare/v0.21.13...v0.21.14) - 2025-01-13
### Added
 - Support for virtual variables in the debug protocol (available starting in Roku OS 14.1.4) ([#199](https://github.com/rokucommunity/roku-debug/pull/199))
 - Support for configuring breakpoints on caught and uncaught exceptions (available starting in Roku OS 14.1.4) ([#198](https://github.com/rokucommunity/roku-debug/pull/198))
### Changed
 - upgrade to [brighterscript@0.68.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0683---2025-01-13)



## [0.21.13](https://github.com/rokucommunity/roku-debug/compare/v0.21.12...v0.21.13) - 2024-12-20
### Added
 - Add `$children` virtual variables for `roSGNode` ([#192](https://github.com/rokucommunity/roku-debug/pull/192))
 - Check for two error types. Make sure we do not double display an error ([#204](https://github.com/rokucommunity/roku-debug/pull/204))
 - Add the missing `Diagnostic` props to `BSDebugDiagnostic` ([#203](https://github.com/rokucommunity/roku-debug/pull/203))
### Changed
 - upgrade to [brighterscript@0.68.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0682---2024-12-06). Notable changes since 0.67.8:
     - Add more convenience exports from vscode-languageserver ([brighterscript#1359](https://github.com/rokucommunity/brighterscript/pull/1359))
     - Fix issues with the ast walkArray function ([brighterscript#1347](https://github.com/rokucommunity/brighterscript/pull/1347))
 - upgrade to [roku-deploy@3.12.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3123---2024-12-06). Notable changes since 3.12.2:
     - Fix issues with detecting "check for updates required" ([roku-deploy#181](https://github.com/rokucommunity/roku-deploy/pull/181))
     - Identify when a 577 error is thrown, send a new developer friendly message ([roku-deploy#180](https://github.com/rokucommunity/roku-deploy/pull/180))
### Fixed 
 - Fix cli bug ([#201](https://github.com/rokucommunity/roku-debug/pull/201))



## [0.21.12](https://github.com/rokucommunity/roku-debug/compare/v0.21.11...v0.21.12) - 2024-10-18
### Changed
 - upgrade to [brighterscript@0.67.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0678---2024-10-18). Notable changes since 0.67.7:
     - Fix namespace-relative transpile bug for standalone file ([brighterscript#1324](https://github.com/rokucommunity/brighterscript/pull/1324))
     - Update README.md with "help" items ([#brighterscript3abcdaf3](https://github.com/rokucommunity/brighterscript/commit/3abcdaf3))
     - Prevent crash when ProgramBuilder.run called with no options ([brighterscript#1316](https://github.com/rokucommunity/brighterscript/pull/1316))
 - upgrade to [roku-deploy@3.12.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3122---2024-10-18). Notable changes since 3.12.1:
     - fixes #175 - updated regex to find a signed package on `/plugin_package` page ([roku-deploy#176](https://github.com/rokucommunity/roku-deploy/pull/176))



## [0.21.11](https://github.com/rokucommunity/roku-debug/compare/v0.21.10...0.21.11) - 2024-09-25
### Changed
 - upgrade to [brighterscript@0.67.7](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0677---2024-09-25). Notable changes since 0.67.4:
     - Ast node clone ([brighterscript#1281](https://github.com/rokucommunity/brighterscript/pull/1281))
     - Add support for resolving sourceRoot at time of config load ([brighterscript#1290](https://github.com/rokucommunity/brighterscript/pull/1290))
     - Add support for roIntrinsicDouble ([brighterscript#1291](https://github.com/rokucommunity/brighterscript/pull/1291))
     - Add plugin naming convention ([brighterscript#1284](https://github.com/rokucommunity/brighterscript/pull/1284))
     - Add templatestring support for annotation.getArguments() ([brighterscript#1264](https://github.com/rokucommunity/brighterscript/pull/1264))



## [0.21.10](https://github.com/rokucommunity/roku-debug/compare/v0.21.9...0.21.10) - 2024-07-24
### Changed
 - Prevent crash when rokuAdapter is not defined. ([#194](https://github.com/rokucommunity/roku-debug/pull/194))
 - upgrade to [brighterscript@0.67.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0674---2024-07-24). Notable changes since 0.67.2:
     - Fix crash with missing scope ([brighterscript#1234](https://github.com/rokucommunity/brighterscript/pull/1234))
     - Flag using devDependency in production code ([brighterscript#1222](https://github.com/rokucommunity/brighterscript/pull/1222))
 - upgrade to [roku-deploy@3.12.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3121---2024-07-19). Notable changes since 3.12.0:
     - Fix bug with absolute paths and getDestPath ([roku-deploy#171](https://github.com/rokucommunity/roku-deploy/pull/171))



## [0.21.9](https://github.com/rokucommunity/roku-debug/compare/v0.21.8...v0.21.9) - 2024-06-03
### Changed
 - upgrade to [brighterscript@0.67.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0672---2024-06-03)
### Fixed
 - Prevent corrupted breakpoints due to invalid sourceDirs, add more logging ([#189](https://github.com/rokucommunity/roku-debug/pull/189))



## [0.21.8](https://github.com/rokucommunity/roku-debug/compare/v0.21.7...v0.21.8) - 2024-05-16
### Changed
 - upgrade to [brighterscript@0.67.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0671---2024-05-16). Notable changes since 0.65.27:
     - Fix crash when diagnostic is missing range ([brighterscript#1174](https://github.com/rokucommunity/brighterscript/pull/1174))
     - Upgrade to @rokucommunity/logger ([brighterscript#1137](https://github.com/rokucommunity/brighterscript/pull/1137))
 - upgrade to [@rokucommunity/logger@0.3.9](https://github.com/rokucommunity/logger/blob/master/CHANGELOG.md#039---2024-05-09)
### Fixed
 - node14 CI bugs ([#188](https://github.com/rokucommunity/roku-debug/pull/188))



## [0.21.7](https://github.com/rokucommunity/roku-debug/compare/v0.21.6...v0.21.7) - 2024-03-27
### Changed
 - upgrade to [brighterscript@0.65.27](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06527---2024-03-27). Notable changes since 0.65.25:
     - Upgade LSP packages ([brighterscript#1117](https://github.com/rokucommunity/brighterscript/pull/1117))
     - Increase max param count to 63 ([brighterscript#1112](https://github.com/rokucommunity/brighterscript/pull/1112))
     - Prevent unused variable warnings on ternary and null coalescence expressions ([brighterscript#1101](https://github.com/rokucommunity/brighterscript/pull/1101))
### Fixed
 - Optional Chainging Operator errors in debug console ([#187](https://github.com/rokucommunity/roku-debug/pull/187))



## [0.21.6](https://github.com/rokucommunity/roku-debug/compare/v0.21.5...v0.21.6) - 2024-03-07
### Changed
 - upgrade to [brighterscript@0.65.25](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06525---2024-03-07). Notable changes since 0.65.23:
     - Support when tokens have null ranges ([brighterscript#1072](https://github.com/rokucommunity/brighterscript/pull/1072))
     - Support whitespace in conditional compile keywords ([brighterscript#1090](https://github.com/rokucommunity/brighterscript/pull/1090))



## [0.21.5](https://github.com/rokucommunity/roku-debug/compare/v0.21.4...v0.21.5) - 2024-03-01
### Changed
 - Add some enhanced launch settings to support more diverse projects ([#184](https://github.com/rokucommunity/roku-debug/pull/184))
 - upgrade to [roku-deploy@3.12.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3120---2024-03-01). Notable changes since 3.11.3:
     - Support overriding various package upload form data ([roku-deploy#136](https://github.com/rokucommunity/roku-deploy/pull/136))



## [0.21.4](https://github.com/rokucommunity/roku-debug/compare/v0.21.3...v0.21.4) - 2024-02-29
### Changed
 - upgrade to [brighterscript@0.65.23](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06523---2024-02-29). Notable changes since 0.65.19:
     - Fix sourcemap comment and add `file` prop to map ([brighterscript#1064](https://github.com/rokucommunity/brighterscript/pull/1064))
     - Move `coveralls-next` to a devDependency since it's not needed at runtime ([brighterscript#1051](https://github.com/rokucommunity/brighterscript/pull/1051))
     - Fix parsing issues with multi-index IndexedSet and IndexedGet ([brighterscript#1050](https://github.com/rokucommunity/brighterscript/pull/1050))
 - upgrade to [roku-deploy@3.11.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3113---2024-02-29). Notable changes since 3.11.2:
     - Retry the convertToSquahsfs request given the HPE_INVALID_CONSTANT error ([roku-deploy#145](https://github.com/rokucommunity/roku-deploy/pull/145))
### Fixed
 - DebugProtocol fixes ([#186](https://github.com/rokucommunity/roku-debug/pull/186))
 - Support relaunch debug protocol ([#181](https://github.com/rokucommunity/roku-debug/pull/181))



## [0.21.3](https://github.com/rokucommunity/roku-debug/compare/v0.21.2...v0.21.3) - 2024-01-30
### Changed
 - upgrade to [brighterscript@0.65.19](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06519---2024-01-30). Notable changes since 0.65.18:
     - Backport v1 syntax changes ([brighterscript#1034](https://github.com/rokucommunity/brighterscript/pull/1034))



## [0.21.2](https://github.com/rokucommunity/roku-debug/compare/v0.21.1...v0.21.2) - 2024-01-25
### Changed
 - Use `stagingDir` instead of stagingFolderPath ([#185](https://github.com/rokucommunity/roku-debug/pull/185))
 - upgrade to [brighterscript@0.65.18](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06518---2024-01-25). Notable changes since 0.65.17:
     - Refactor bsconfig documentation ([brighterscript#1024](https://github.com/rokucommunity/brighterscript/pull/1024))
     - Prevent overwriting the Program._manifest if already set on startup ([brighterscript#1027](https://github.com/rokucommunity/brighterscript/pull/1027))
     - Improving null safety: Add FinalizedBsConfig and tweak plugin events ([brighterscript#1000](https://github.com/rokucommunity/brighterscript/pull/1000))



## [0.21.1](https://github.com/rokucommunity/roku-debug/compare/v0.21.0...v0.21.1) - 2024-01-16
### Changed
 - upgrade to [brighterscript@0.65.17](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06517---2024-01-16). Notable changes since 0.65.16:
     - adds support for libpkg prefix ([brighterscript#1017](https://github.com/rokucommunity/brighterscript/pull/1017))
     - Assign .program to the builder BEFORE calling afterProgram ([brighterscript#1011](https://github.com/rokucommunity/brighterscript/pull/1011))



## [0.21.0](https://github.com/rokucommunity/roku-debug/compare/v0.20.15...v0.21.0) - 2024-01-10
### Added
 - Add cli flag to run dap as standalone process ([#173](https://github.com/rokucommunity/roku-debug/pull/173))
 - Expose `controlPort` launch option for overriding the debug protocol port ([#182](https://github.com/rokucommunity/roku-debug/pull/182))



## [0.20.15](https://github.com/rokucommunity/roku-debug/compare/v0.20.14...v0.20.15) - 2024-01-08
### Changed
 - Display a modal message when the we fail to upload a package to the device ([#178](https://github.com/rokucommunity/roku-debug/pull/178))
 - upgrade to [brighterscript@0.65.16](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06516---2024-01-08)
 - upgrade to [roku-deploy@3.11.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3112---2023-12-20). Notable changes since 3.11.1:
     - Update wrong host password error message ([roku-deploy#134](https://github.com/rokucommunity/roku-deploy/pull/134))



## [0.20.14](https://github.com/rokucommunity/roku-debug/compare/v0.20.13...v0.20.14) - 2023-12-07
### Changed
 - make the connection port for SceneGraphDebugCommandController configurable ([#177](https://github.com/rokucommunity/roku-debug/pull/177))
 - upgrade to [brighterscript@0.65.12](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06512---2023-12-07)
 - upgrade to [roku-deploy@3.11.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3111---2023-11-30). Notable changes since 3.10.5:
     - wait for file stream to close before resolving promise ([roku-deploy#133](https://github.com/rokucommunity/roku-deploy/pull/133))
     - add public function to normalize device-info field values ([roku-deploy#129](https://github.com/rokucommunity/roku-deploy/pull/129))



## [0.20.13](https://github.com/rokucommunity/roku-debug/compare/v0.20.12...v0.20.13) - 2023-11-16
### Fixed
 - Fix bug with compile error reporting ([#174](https://github.com/rokucommunity/roku-debug/pull/174))



## [0.20.12](https://github.com/rokucommunity/roku-debug/compare/v0.20.11...v0.20.12) - 2023-11-14
### Changed
 - Add timeout for deviceinfo query so we don't wait too long ([#171](https://github.com/rokucommunity/roku-debug/pull/171))
 - upgrade to [brighterscript@0.65.10](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06510---2023-11-14). Notable changes since 0.65.9:
 - upgrade to [roku-deploy@3.10.5](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3105---2023-11-14). Notable changes since 3.10.4:
     - better error detection when sideload fails ([roku-deploy#127](https://github.com/rokucommunity/roku-deploy/pull/127))



## [0.20.11](https://github.com/rokucommunity/roku-debug/compare/v0.20.10...v0.20.11) - 2023-11-11
### Changed
 - Update DebugProtocolClient supported version range ([#170](https://github.com/rokucommunity/roku-debug/pull/170))
 - fix small typo in debug potocol message ([#169](https://github.com/rokucommunity/roku-debug/pull/169))



## [0.20.10](https://github.com/rokucommunity/roku-debug/compare/v0.20.9...v0.20.10) - 2023-11-08
### Changed
 - upgrade to [brighterscript@0.65.9](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0659---2023-11-06). Notable changes since 0.65.8:
     - Fix issue with unary expression parsing ([brighterscript#938](https://github.com/rokucommunity/brighterscript/pull/938))
     - ci: Don't run `test-related-projects` on release since it already ran on build ([#brighterscript157fc2e](https://github.com/rokucommunity/brighterscript/commit/157fc2e))
### Fixed
 - Fix sideload crash related to failed dev app deletion ([#168](https://github.com/rokucommunity/roku-debug/pull/168))



## [0.20.9](https://github.com/rokucommunity/roku-debug/compare/v0.20.8...v0.20.9) - 2023-11-05
### Changed
 - Upgrade to enhanced deviceInfo api from roku-deploy ([#167](https://github.com/rokucommunity/roku-debug/pull/167))
 - upgrade to [roku-deploy@3.10.4](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3104---2023-11-03). Notable changes since 3.10.3:
     - Enhance getDeviceInfo() method ([roku-deploy#120](https://github.com/rokucommunity/roku-deploy/pull/120))



## [0.20.8](https://github.com/rokucommunity/roku-debug/compare/v0.20.7...v0.20.8) - 2023-10-31
### Fixed
 - Clean up control socket when it's closed ([#166](https://github.com/rokucommunity/roku-debug/pull/166))



## [0.20.7](https://github.com/rokucommunity/roku-debug/compare/v0.20.6...v0.20.7) - 2023-10-16
### Changed
 - Debug Protocol Enhancements ([#107](https://github.com/rokucommunity/roku-debug/pull/107))



## [0.20.6](https://github.com/rokucommunity/roku-debug/compare/v0.20.5...v0.20.6) - 2023-10-06
### Changed
 - upgrade to [brighterscript@0.65.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0658---2023-10-06). Notable changes since 0.65.7:
     - Bump postcss from 8.2.15 to 8.4.31 ([brighterscript#928](https://github.com/rokucommunity/brighterscript/pull/928))
     - Add interface parameter support ([brighterscript#924](https://github.com/rokucommunity/brighterscript/pull/924))
     - Better typing for `Deferred` ([brighterscript#923](https://github.com/rokucommunity/brighterscript/pull/923))
### Fixed
 - bug with telnet getting stuck ([#163](https://github.com/rokucommunity/roku-debug/pull/163))



## [0.20.5](https://github.com/rokucommunity/roku-debug/compare/v0.20.4...v0.20.5) - 2023-09-28
### Changed
 - upgrade to [brighterscript@0.65.7](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0657---2023-09-28). Notable changes since 0.65.5:



## [0.20.4](https://github.com/rokucommunity/roku-debug/compare/v0.20.3...v0.20.4) - 2023-09-11
### Changed
 - upgrade to [brighterscript@0.65.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0655---2023-09-06). Notable changes since 0.65.4:
     - Fix crashes in util for null ranges ([brighterscript#869](https://github.com/rokucommunity/brighterscript/pull/869))



## [0.20.3](https://github.com/rokucommunity/roku-debug/compare/v0.20.2...0.20.3) - 2023-07-26
### Added
 - Add `deleteDevChannelBeforeInstall` launch option ([#158](https://github.com/rokucommunity/roku-debug/pull/158))



## [0.20.2](https://github.com/rokucommunity/roku-debug/compare/v0.20.1...v0.20.2) - 2023-07-24
### Changed
 - Bump word-wrap from 1.2.3 to 1.2.4 ([#157](https://github.com/rokucommunity/roku-debug/pull/157))
 - upgrade to [brighterscript@0.65.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0654---2023-07-24). Notable changes since 0.65.1:
     - Bump word-wrap from 1.2.3 to 1.2.4 ([brighterscript#851](https://github.com/rokucommunity/brighterscript/pull/851))
     - Bump semver from 6.3.0 to 6.3.1 in /benchmarks ([brighterscript#838](https://github.com/rokucommunity/brighterscript/pull/838))
     - Bump semver from 5.7.1 to 5.7.2 ([brighterscript#837](https://github.com/rokucommunity/brighterscript/pull/837))
     - Prevent crashing when diagnostic is missing range. ([brighterscript#832](https://github.com/rokucommunity/brighterscript/pull/832))
     - Prevent crash when diagnostic is missing range ([brighterscript#831](https://github.com/rokucommunity/brighterscript/pull/831))
 - upgrade to [roku-deploy@3.10.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3103---2023-07-22). Notable changes since 3.10.2:
     - Bump word-wrap from 1.2.3 to 1.2.4 ([roku-deploy#117](https://github.com/rokucommunity/roku-deploy/pull/117))



## [0.20.1](https://github.com/rokucommunity/roku-debug/compare/v0.20.0...v0.20.1) - 2023-07-07
### Changed
 - Fix rendezvous crash ([#156](https://github.com/rokucommunity/roku-debug/pull/156))



## [0.20.0](https://github.com/rokucommunity/roku-debug/compare/v0.19.1...v0.20.0) - 2023-07-05
### Added
 - Support sgrendezvous through ECP ([#150](https://github.com/rokucommunity/roku-debug/pull/150))
### Changed
 - upgrade to [brighterscript@0.65.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0651---2023-06-09)



## [0.19.1](https://github.com/rokucommunity/roku-debug/compare/v0.19.0...v0.19.1) - 2023-06-08
### Changed
 - Move @types/request to deps to fix d.bs files ([691a7be](https://github.com/rokucommunity/roku-debug/commit/691a7be))



## [0.19.0](https://github.com/rokucommunity/roku-debug/compare/v0.18.12...v0.19.0) - 2023-06-01
### Added
 - File logging ([#155](https://github.com/rokucommunity/roku-debug/pull/155))



## [0.18.12](https://github.com/rokucommunity/roku-debug/compare/v0.18.11...v0.18.12) - 2023-05-18
### Changed
 - remove axios in favor of postman-request ([#153](https://github.com/rokucommunity/roku-debug/pull/153))
### Fixed
 - Fix `file already exists` error and hung process ([#152](https://github.com/rokucommunity/roku-debug/pull/152))



## [0.18.11](https://github.com/rokucommunity/roku-debug/compare/v0.18.10...v0.18.11) - 2023-05-17
### Changed
 - Fix crash by using postman-request ([#151](https://github.com/rokucommunity/roku-debug/pull/151))



## [0.18.10](https://github.com/rokucommunity/roku-debug/compare/v0.18.9...v0.18.10) - 2023-05-17
### Changed
 - upgrade to [brighterscript@0.65.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0650---2023-05-17)
 - upgrade to [@rokucommunity/logger@0.3.3](https://github.com/rokucommunity/logger/blob/master/CHANGELOG.md#033---2023-05-17). Notable changes since 0.3.2:
     - Fix dependencies ([#@rokucommunity/logger04af7a0](https://github.com/rokucommunity/logger/commit/04af7a0))



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



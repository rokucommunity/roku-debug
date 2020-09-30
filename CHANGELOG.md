# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## [0.5.6] - 2020-09-30
### Fixed
 - bug that prevented component library debug sessions from launching.



## [0.5.5] - 2020-09-28
### Fixed
 - bug in the component library bundling that was using the `src` instead of `dest` for finding the manifest path ([#15](https://github.com/rokucommunity/roku-debug/pull/15))



## [0.5.4] - 2020-09-25
### Changed
 - fixed some false positive detections of `Can't continue` in the TelnetAdapter
 - fixed version comparision links in the changelogs



## [0.5.3] - 2020-08-14
### Changed
 - upgraded to [roku-deploy@3.2.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#323---2020-08-14)
 - throw exception when copying to staging folder and `rootDir` does not exist in the file system
 - throw exception when zipping package and `${stagingFolder}/manifest` does not exist in the file system



## [0.5.2] - 2020-07-14
### Changed
 - upgraded to [roku-deploy@3.2.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#322---2020-07-14)
### Fixed
 - bug when loading stagingFolderPath from `rokudeploy.json` or `bsconfig.json` that would cause an exception.



## [0.5.1] - 2020-07-11
### Fixed
 - Prevent debug session crash if target breakpoint file doesn't exist. [#10](https://github.com/rokucommunity/roku-debug/pull/10)
  -Bug when converting source location to staging locations that incorrectly checked rootDir before sourceDirs. [#10](https://github.com/rokucommunity/roku-debug/pull/10)



## [0.5.0] - 2020-07-06
### Added
 - support for inline values during a debug session. [#8](https://github.com/rokucommunity/roku-debug/pull/8)
### Fixed
 - Fixed bug when inspecting indexed variables that would always show the list or array itself when using the BrightScript debug protocol [#8](https://github.com/rokucommunity/roku-debug/pull/8)



## [0.4.0] - 2020-07-02
### Changed
 - Try to look up original function names for anonymous functions in call stack [#6](https://github.com/rokucommunity/roku-debug/issues/6)



## [0.3.7] - 2020-05-11
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



[0.3.4]:  https://github.com/RokuCommunity/roku-debug/compare/v0.1.0...v0.3.4
[0.3.5]:  https://github.com/RokuCommunity/roku-debug/compare/v0.3.4...v0.3.5
[0.3.6]:  https://github.com/RokuCommunity/roku-debug/compare/v0.3.5...v0.3.6
[0.3.7]:  https://github.com/RokuCommunity/roku-debug/compare/v0.3.6...v0.3.7
[0.4.0]:  https://github.com/RokuCommunity/roku-debug/compare/v0.3.7...v0.4.0
[0.5.0]:  https://github.com/RokuCommunity/roku-debug/compare/v0.4.0...v0.5.0
[0.5.1]:  https://github.com/RokuCommunity/roku-debug/compare/v0.5.0...v0.5.1
[0.5.2]:  https://github.com/RokuCommunity/roku-debug/compare/v0.5.1...v0.5.2
[0.5.3]:  https://github.com/RokuCommunity/roku-debug/compare/v0.5.2...v0.5.3
[0.5.4]:  https://github.com/RokuCommunity/roku-debug/compare/v0.5.3...v0.5.4
[0.5.5]:  https://github.com/RokuCommunity/roku-debug/compare/v0.5.4...v0.5.5
[0.5.6]:  https://github.com/RokuCommunity/roku-debug/compare/v0.5.5...v0.5.6

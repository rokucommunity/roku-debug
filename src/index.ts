import { BrightscriptDebugger } from './BrightscriptDebugger';

//export everything from the BrightscriptDebugger file
export * from './BrightscriptDebugger';

import { util } from './util';

//create a new static instance of BrightscriptDebugger, and export those functions for backwards compatibility
let brightscriptDebugger = new BrightscriptDebugger();

let start = BrightscriptDebugger.prototype.start.bind(brightscriptDebugger);

// TODO: remove temporary code
(async () => {
  await start(await util.readJsonFile('rokudeploy.json'));
})();

export {
  start
};

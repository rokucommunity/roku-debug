import { expect } from 'chai';
import { isDiagnosticsEventEvent, DiagnosticsEvent, isLogOutputEvent, LogOutputEvent, isDebugServerLogOutputEvent, DebugServerLogOutputEvent, isRendezvousEvent, RendezvousEvent, isChanperfEvent, ChanperfEvent, isLaunchStartEvent, LaunchStartEvent, isPopupMessageEvent, PopupMessageEvent, isChannelPublishedEvent, ChannelPublishedEvent } from './Events';

describe('Events', () => {
    it('is* methods work properly', () => {
        //match
        expect(isDiagnosticsEventEvent(new DiagnosticsEvent(null))).to.be.true;
        expect(isLogOutputEvent(new LogOutputEvent(null))).to.be.true;
        expect(isDebugServerLogOutputEvent(new DebugServerLogOutputEvent(null))).to.be.true;
        expect(isRendezvousEvent(new RendezvousEvent(null))).to.be.true;
        expect(isChanperfEvent(new ChanperfEvent(null))).to.be.true;
        expect(isLaunchStartEvent(new LaunchStartEvent(null))).to.be.true;
        expect(isPopupMessageEvent(new PopupMessageEvent(null, 'error'))).to.be.true;
        expect(isChannelPublishedEvent(new ChannelPublishedEvent(null))).to.be.true;

        //not match
        expect(isDiagnosticsEventEvent(null)).to.be.false;
        expect(isLogOutputEvent(null)).to.be.false;
        expect(isDebugServerLogOutputEvent(null)).to.be.false;
        expect(isRendezvousEvent(null)).to.be.false;
        expect(isChanperfEvent(null)).to.be.false;
        expect(isLaunchStartEvent(null)).to.be.false;
        expect(isPopupMessageEvent(null)).to.be.false;
        expect(isChannelPublishedEvent(null)).to.be.false;
    });
});

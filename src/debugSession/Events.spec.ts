import { expect } from 'chai';
import { isDiagnosticsEvent, DiagnosticsEvent, isLogOutputEvent, LogOutputEvent, isDebugServerLogOutputEvent, DebugServerLogOutputEvent, isRendezvousEvent, RendezvousEvent, isChanperfEvent, ChanperfEvent, isLaunchStartEvent, LaunchStartEvent, isChannelPublishedEvent, ChannelPublishedEvent } from './Events';

describe('Events', () => {
    it('is* methods work properly', () => {
        //match
        expect(isDiagnosticsEvent(new DiagnosticsEvent(null))).to.be.true;
        expect(isLogOutputEvent(new LogOutputEvent(null))).to.be.true;
        expect(isDebugServerLogOutputEvent(new DebugServerLogOutputEvent(null))).to.be.true;
        expect(isRendezvousEvent(new RendezvousEvent(null))).to.be.true;
        expect(isChanperfEvent(new ChanperfEvent(null))).to.be.true;
        expect(isLaunchStartEvent(new LaunchStartEvent(null))).to.be.true;
        expect(isChannelPublishedEvent(new ChannelPublishedEvent(null))).to.be.true;

        //not match
        expect(isDiagnosticsEvent(null)).to.be.false;
        expect(isLogOutputEvent(null)).to.be.false;
        expect(isDebugServerLogOutputEvent(null)).to.be.false;
        expect(isRendezvousEvent(null)).to.be.false;
        expect(isChanperfEvent(null)).to.be.false;
        expect(isLaunchStartEvent(null)).to.be.false;
        expect(isChannelPublishedEvent(null)).to.be.false;
    });
});

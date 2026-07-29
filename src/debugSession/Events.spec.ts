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

    it('scrubs the rceToken from the launch config echoed in LaunchStartEvent and ChannelPublishedEvent', () => {
        const launchConfiguration = {
            rootDir: '/some/project',
            device: { instanceUrl: 'https://device.rce.roku.com/instance/abc', rceToken: 'secret-token' }
        } as any;

        const launchStartEvent = new LaunchStartEvent(launchConfiguration);
        expect((launchStartEvent.body.device as any).rceToken).to.be.undefined;
        expect((launchStartEvent.body.device as any).instanceUrl).to.equal('https://device.rce.roku.com/instance/abc');
        expect(launchStartEvent.body.rootDir).to.equal('/some/project');

        const channelPublishedEvent = new ChannelPublishedEvent(launchConfiguration);
        expect((channelPublishedEvent.body.launchConfiguration.device as any).rceToken).to.be.undefined;

        //the original config is left untouched (the debugger still needs the token)
        expect(launchConfiguration.device.rceToken).to.equal('secret-token');
    });

    it('leaves a local device config untouched in echoed events', () => {
        const launchConfiguration = { device: { host: '1.2.3.4' } } as any;
        const launchStartEvent = new LaunchStartEvent(launchConfiguration);
        expect(launchStartEvent.body.device).to.eql({ host: '1.2.3.4' });
    });
});

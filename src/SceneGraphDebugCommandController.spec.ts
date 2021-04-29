import * as sinon from 'sinon';
import { expect } from 'chai';
import { SceneGraphDebugCommandController } from './SceneGraphDebugCommandController';

describe('SceneGraphDebugCommandController ', () => {
    let commandController: SceneGraphDebugCommandController;
    let execStub: sinon.SinonStub;

    beforeEach(() => {
        commandController = new SceneGraphDebugCommandController('192.168.1.1');
        (commandController as any).connectionSuccessful = true;
        execStub = sinon.stub(commandController, 'exec');
    });

    afterEach(() => {
        execStub.restore();
    });

    describe('formats bsprof correctly', () => {
        it('bsprof-pause', async () => {
            await commandController.bsprof('pause');
            expect(execStub.withArgs('bsprof-pause').calledOnce).to.be.true;
        });

        it('bsprof-resume', async () => {
            await commandController.bsprof('resume');
            expect(execStub.withArgs('bsprof-resume').calledOnce).to.be.true;
        });

        it('bsprof-status', async () => {
            await commandController.bsprof('status');
            expect(execStub.withArgs('bsprof-status').calledOnce).to.be.true;
        });
    });

    describe('formats chanperf correctly', () => {
        it('chanperf', async () => {
            await commandController.chanperf();
            expect(execStub.withArgs('chanperf').calledOnce).to.be.true;
        });

        it('chanperf -r 1', async () => {
            await commandController.chanperf({ interval: 1 });
            expect(execStub.withArgs('chanperf -r 1').calledOnce).to.be.true;
        });

        it('chanperf -r 0', async () => {
            await commandController.chanperf({ interval: 0 });
            expect(execStub.withArgs('chanperf -r 0').calledOnce).to.be.true;
        });

        it('chanperf when given negative interval', async () => {
            await commandController.chanperf({ interval: -1 });
            expect(execStub.withArgs('chanperf').calledOnce).to.be.true;
        });
    });

    describe('formats simple commands without arguments correctly', () => {
        it('clear_launch_caches', async () => {
            await commandController.clearLaunchCaches();
            expect(execStub.withArgs('clear_launch_caches').calledOnce).to.be.true;
        });

        it('free', async () => {
            await commandController.free();
            expect(execStub.withArgs('free').calledOnce).to.be.true;
        });

        it('genkey', async () => {
            await commandController.genkey();
            expect(execStub.withArgs('genkey').calledOnce).to.be.true;
        });

        it('loaded_textures', async () => {
            await commandController.loadedTextures();
            expect(execStub.withArgs('loaded_textures').calledOnce).to.be.true;
        });

        it('plugins', async () => {
            await commandController.plugins();
            expect(execStub.withArgs('plugins').calledOnce).to.be.true;
        });

        it('r2d2_bitmaps', async () => {
            await commandController.r2d2Bitmaps();
            expect(execStub.withArgs('r2d2_bitmaps').calledOnce).to.be.true;
        });

        it('showkey', async () => {
            await commandController.showkey();
            expect(execStub.withArgs('showkey').calledOnce).to.be.true;
        });
    });

    describe('formats fps_display correctly', () => {
        it('fps_display', async () => {
            await commandController.fpsDisplay('toggle');
            expect(execStub.withArgs('fps_display').calledOnce).to.be.true;
        });

        it('fps_display 1', async () => {
            await commandController.fpsDisplay('on');
            expect(execStub.withArgs('fps_display 1').calledOnce).to.be.true;
        });

        it('fps_display 0', async () => {
            await commandController.fpsDisplay('off');
            expect(execStub.withArgs('fps_display 0').calledOnce).to.be.true;
        });
    });

    describe('formats logrendezvous correctly', () => {
        it('logrendezvous', async () => {
            await commandController.logrendezvous('status');
            expect(execStub.withArgs('logrendezvous').calledOnce).to.be.true;
        });

        it('logrendezvous on', async () => {
            await commandController.logrendezvous('on');
            expect(execStub.withArgs('logrendezvous on').calledOnce).to.be.true;
        });

        it('logrendezvous off', async () => {
            await commandController.logrendezvous('off');
            expect(execStub.withArgs('logrendezvous off').calledOnce).to.be.true;
        });
    });

    describe('formats press correctly', () => {
        it('press up', async () => {
            await commandController.press(['up']);
            expect(execStub.withArgs('press up').calledOnce).to.be.true;
        });

        it('press up, down, left, right', async () => {
            await commandController.press(['up', 'down', 'left', 'right']);
            expect(execStub.withArgs('press up, down, left, right').calledOnce).to.be.true;
        });
    });

    describe('formats removePlugin correctly', () => {
        it('remove_plugin 12345', async () => {
            await commandController.removePlugin('12345');
            expect(execStub.withArgs('remove_plugin 12345').calledOnce).to.be.true;
        });

        it('remove_plugin 12345_aeft', async () => {
            await commandController.removePlugin('12345_aeft');
            expect(execStub.withArgs('remove_plugin 12345_aeft').calledOnce).to.be.true;
        });
    });

    describe('formats sgnodes correctly', () => {
        it('sgnodes all', async () => {
            await commandController.sgnodes('all');
            expect(execStub.withArgs('sgnodes all').calledOnce).to.be.true;
        });

        it('sgnodes roots', async () => {
            await commandController.sgnodes('roots');
            expect(execStub.withArgs('sgnodes roots').calledOnce).to.be.true;
        });

        it('sgnodes my_custom_id', async () => {
            await commandController.sgnodes('my_custom_id');
            expect(execStub.withArgs('sgnodes my_custom_id').calledOnce).to.be.true;
        });
    });

    describe('formats sgperf correctly', () => {
        it('sgperf start', async () => {
            await commandController.sgperf('start');
            expect(execStub.withArgs('sgperf start').calledOnce).to.be.true;
        });

        it('sgperf clear', async () => {
            await commandController.sgperf('clear');
            expect(execStub.withArgs('sgperf clear').calledOnce).to.be.true;
        });

        it('sgperf report', async () => {
            await commandController.sgperf('report');
            expect(execStub.withArgs('sgperf report').calledOnce).to.be.true;
        });

        it('sgperf stop', async () => {
            await commandController.sgperf('stop');
            expect(execStub.withArgs('sgperf stop').calledOnce).to.be.true;
        });
    });

    describe('formats type correctly', () => {
        it('type my message', async () => {
            await commandController.type('my message');
            expect(execStub.withArgs('type my message').calledOnce).to.be.true;
        });
    });

    describe('formats custom correctly', () => {
        it('chanperf -r 10', async () => {
            await commandController.exec('chanperf -r 10');
            expect(execStub.withArgs('chanperf -r 10').calledOnce).to.be.true;
        });

        it('super secrete command', async () => {
            await commandController.exec('super secrete command');
            expect(execStub.withArgs('super secrete command').calledOnce).to.be.true;
        });
    });
});

import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as getPort from 'get-port';
import * as http from 'http';
import * as path from 'path';
import { standardizePath as s } from 'brighterscript';
import { ComponentLibraryServer } from './ComponentLibraryServer';
import { util } from './util';

const tempDir = s`${__dirname}/../.tmp/ComponentLibraryServer`;

describe('ComponentLibraryServer', () => {
    let server: ComponentLibraryServer;
    let port: number;

    beforeEach(async () => {
        fsExtra.emptyDirSync(tempDir);
        fsExtra.outputFileSync(path.join(tempDir, 'lib.zip'), 'zip');
        server = new ComponentLibraryServer();
        port = await getPort();
    });

    afterEach(async () => {
        await server.stop();
        fsExtra.removeSync(tempDir);
    });

    /**
     * Downloads a file over a kept-alive connection, the way the device does, and leaves the connection open
     */
    function download(file: string) {
        const agent = new http.Agent({ keepAlive: true });
        return new Promise<void>((resolve, reject) => {
            http.get({ port: port, path: `/${file}`, agent: agent }, (res) => {
                res.resume();
                res.on('end', resolve);
            }).on('error', reject);
        });
    }

    describe('stop', () => {
        it('frees the port once it resolves', async () => {
            await server.startStaticFileHosting(tempDir, port, () => { });

            await server.stop();

            expect(await util.isPortInUse(port)).to.be.false;
        });

        it('frees the port while a client holds a kept-alive connection', async () => {
            await server.startStaticFileHosting(tempDir, port, () => { });
            await download('lib.zip');

            await server.stop();

            expect(await util.isPortInUse(port)).to.be.false;
        });

        it('lets the server start again on the same port', async () => {
            await server.startStaticFileHosting(tempDir, port, () => { });
            await download('lib.zip');

            await server.stop();
            await server.startStaticFileHosting(tempDir, port, () => { });

            expect(await util.isPortInUse(port)).to.be.true;
        });

        it('does nothing when the server was never started', async () => {
            await server.stop();
        });
    });
});

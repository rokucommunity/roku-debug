import { expect } from 'chai';
import { expectThrowsAsync } from '../testHelpers.spec';
import { ActionQueue } from './ActionQueue';

describe('ActionQueue', () => {
    it('rejects after maxTries is reached', async () => {
        const queue = new ActionQueue();
        let count = 0;
        await expectThrowsAsync(async () => {
            return queue.run(() => {
                count++;
                return false;
            }, 3);
        }, 'Exceeded the 3 maximum tries for this ActionQueue action');
        expect(count).to.eql(3);
    });
});

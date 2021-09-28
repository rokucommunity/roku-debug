import { expect } from 'chai';
import { IdGenerator } from './IdGenerator';

describe('IdGenerator', () => {

    let idgen: IdGenerator<string>;

    beforeEach(() => {
        idgen = new IdGenerator();
    });

    it('returns the same id for same key', () => {
        expect(
            idgen.getId('key1')
        ).to.eql(
            idgen.getId('key1')
        );
    });

    it('returns different id for different key', () => {
        expect(
            idgen.getId('key1')
        ).to.not.eql(
            idgen.getId('key2')
        );
    });
});

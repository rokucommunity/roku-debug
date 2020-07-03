import { FileManager } from './FileManager';
import { expect } from 'chai';
import { Range } from 'vscode-languageserver';
import { createSandbox } from 'sinon';
import * as fsExtra from 'fs-extra';

describe('FileManager', () => {

    const sinon = createSandbox();
    beforeEach(() => {
        sinon.restore();
    });

    let fileManager: FileManager;
    let m: any;
    beforeEach(() => {
        fileManager = new FileManager();
        m = fileManager;
    });

    describe('getFunctionInfo', () => {
        it('finds basic functions', () => {
            expect(
                m.getFunctionInfo(
                    `
                        function Func1()
                        end function
                        sub Sub1()
                        end sub
                    `.split(/\r?\n/)
                )
            ).to.eql([{
                name: 'Func1',
                children: [],
                range: Range.create(1, 0, 2, Number.MAX_SAFE_INTEGER)
            }, {
                name: 'Sub1',
                children: [],
                range: Range.create(3, 0, 4, Number.MAX_SAFE_INTEGER)
            }]);
        });

        it('finds anonymous functions', () => {
            expect(
                m.getFunctionInfo(
                    `
                        sub main()
                            person = {
                                speak: sub()
                                end sub,
                                "sayHi": function
                                end function
                            }
                            doSomething = function()
                            end function
                            m.a[1+2]["cat"] = sub()
                            end sub
                        end sub
                    `.split(/\r?\n/)
                )
            ).to.eql([{
                name: 'main',
                range: Range.create(1, 0, 12, Number.MAX_SAFE_INTEGER),
                children: [{
                    name: 'speak',
                    children: [],
                    range: Range.create(3, 0, 4, Number.MAX_SAFE_INTEGER)
                }, {
                    name: 'sayHi',
                    children: [],
                    range: Range.create(5, 0, 6, Number.MAX_SAFE_INTEGER)
                }, {
                    name: 'doSomething',
                    children: [],
                    range: Range.create(8, 0, 9, Number.MAX_SAFE_INTEGER)
                }, {
                    //complex assignments are hard, so capture the function but skip the name
                    name: undefined,
                    children: [],
                    range: Range.create(10, 0, 11, Number.MAX_SAFE_INTEGER)
                }]
            }]);
        });

        it('does not pick up properties with the function/sub keyword', () => {
            expect(
                m.getFunctionInfo(
                    `
                        sub main()
                            m.sub = true
                            m.function = false
                            person = {
                                sub: false,
                                function: true,
                            }
                            person = {
                                sub = false,
                                function = true
                            }
                        end sub
                    `.split(/\r?\n/)
                )
            ).to.eql([{
                name: 'main',
                children: [],
                range: Range.create(1, 0, 12, Number.MAX_SAFE_INTEGER)
            }]);
        });

        it('returns empty array when mismatched function is found', () => {
            expect(
                m.getFunctionInfo(
                    `
                        sub main()
                        end sub
                        end sub
                    `.split(/\r?\n/)
                )
            ).to.eql([]);
        });
    });

    describe('getFunctionNameMap', () => {
        it('works', () => {
            expect(
                m.getFunctionNameMap(`
                    sub MAIN()
                    end sub
                    function HelloWorld
                    end function
                `)
            ).to.eql({
                main: 'MAIN',
                helloworld: 'HelloWorld'
            });
        });
    });

    describe('getCorrectFunctionNameCase', () => {
        it('loads file from filesystem', () => {
            sinon.stub(fsExtra, 'readFileSync').returns(`
                sub MAIN()
                end sub
            `);
            expect(
                fileManager.getCorrectFunctionNameCase('source/main.brs', 'main')
            ).to.equal(
                'MAIN'
            );
        });

        it('uses cache on subsequent calls file from filesystem', () => {
            let stub = sinon.stub(fsExtra, 'readFileSync').returns(`
                sub MAIN()
                end sub
            `);
            fileManager.getCorrectFunctionNameCase('source/main.brs', 'main');
            fileManager.getCorrectFunctionNameCase('source/main.brs', 'main');
            expect(stub.callCount).to.equal(1);
        });

        it('uses passed-in function name source file is inaccessible', () => {
            expect(
                fileManager.getCorrectFunctionNameCase('does/not/exist.brs', 'main')
            ).to.equal(
                'main'
            );
        });
    });
});

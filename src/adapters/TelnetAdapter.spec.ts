import { expect } from 'chai';
import type { EvaluateContainer } from './TelnetAdapter';
import { TelnetAdapter, RequestPipeline } from './TelnetAdapter';
import * as dedent from 'dedent';
import { HighLevelType } from './DebugProtocolAdapter';

describe('TelnetAdapter ', () => {
    let adapter: TelnetAdapter;

    beforeEach(() => {
        adapter = new TelnetAdapter('127.0.0.1');
    });

    afterEach(() => {
    });

    describe('getExpressionDetails', () => {
        it('correctly handles both types of line endings', () => {
            expect(adapter.getExpressionDetails(
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\r\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld\r\n' +
                '\r\n' +
                'Brightscript Debugger>'
            )).to.equal((
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\r\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld\r\n'
            ));
        });
    });

    describe('getHighLevelTypeDetails', () => {
        it('works', () => {
            expect(adapter.getObjectType('<Component: roAssociativeArray>')).to.equal('roAssociativeArray');
            expect(adapter.getObjectType('<Component: roInvalid>')).to.equal('roInvalid');
            expect(adapter.getObjectType('<Component: roSGNode:ContentNode>')).to.equal('roSGNode:ContentNode');
        });
    });

    // disable:no-trailing-whitespace disable for this test because trailing whitespace matters
    describe('getForLoopPrintedChildren', () => {
        it('finds the proper number of children', () => {
            expect(adapter.getForLoopPrintedChildren('arr', `
                vscode_is_string:falsetrue
                vscode_is_string:falsefalse
                vscode_is_string:truecat
                vscode_is_string:truecat 
                vscode_is_string:true
                vscode_is_string:true 
            `).length).to.equal(6);
        });
        it('handles basic arrays', () => {
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_type_start:Float:vscode_type_stop vscode_is_string:false 1.1 `)[0]).to.deep.include(<EvaluateContainer>{
                name: '0',
                evaluateName: 'arr[0]',
                type: 'Float',
                value: '1.1'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_type_start:Boolean:vscode_type_stop vscode_is_string:falsetrue`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'Boolean',
                value: 'true'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_type_start:Boolean:vscode_type_stop vscode_is_string:falsefalse`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'Boolean',
                value: 'false'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:trueTrailingSpace `)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"TrailingSpace "'
            });
            //empty string
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:true`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '""'
            });
            //whitespace-only string
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:true `)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '" "'
            });
        });

        it('handles newlines in strings', () => {
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:true\n`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"\n"'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:trueRoku\n`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"Roku\n"'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:true\nRoku`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"\nRoku"'
            });
            expect(adapter.getForLoopPrintedChildren('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:trueRoku\nRoku`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"Roku\nRoku"'
            });
        });

        it('skips empty lines', () => {
            //not sure when this would happen in reality, but test it just in case
            expect(adapter.getForLoopPrintedChildren('testNode', `
                vscode_key_start:focusable:vscode_key_stop vscode_is_string:falsefalse

                vscode_key_start:id:vscode_key_stop vscode_is_string:true
            `)).to.be.lengthOf(2);
        });

        it('handles lists larger than 100', () => {

        });

        it('does not include an extra newline for the last item when it is a string', () => {
            const variables = adapter.getForLoopPrintedChildren('testNode',
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld'
            );
            expect(variables.find(x => x.name === 'message1').value).to.equal('"Hello"');
            expect(variables.find(x => x.name === 'message2').value).to.equal('"World"');
        });

        it('handles nodes with nested arrays', () => {
            const variables = adapter.getForLoopPrintedChildren('testNode', dedent`
                vscode_key_start:change:vscode_key_stop vscode_is_string:false<Component: roAssociativeArray> =
                {
                    Index1: 0
                    Index2: 0
                    Operation: "none"
                }
                vscode_key_start:EDID:vscode_key_stop vscode_is_string:false<Component: roByteArray> =
                [
                    0
                    ...
                ]
                vscode_key_start:focusable:vscode_key_stop vscode_type_start:Boolean:vscode_type_stop vscode_is_string:falsefalse
                vscode_key_start:focusedChild:vscode_key_stop vscode_is_string:false<Component: roInvalid>
                vscode_key_start:id:vscode_key_stop vscode_type_start:String:vscode_type_stop vscode_is_string:true
                vscode_key_start:mynewfield:vscode_key_stop vscode_is_string:false<Component: roSGNode:ContentNode> =
                {
                    change: <Component: roAssociativeArray>
                    focusable: false
                    focusedChild: <Component: roInvalid>
                    id: ""
                    TITLE: "Node Three"
                }
            `);
            expect(variables).to.eql([{
                name: 'change',
                evaluateName: 'testNode["change"]',
                highLevelType: 'object',
                type: 'roAssociativeArray',
                children: []
            }, {
                name: 'EDID',
                evaluateName: 'testNode["EDID"]',
                type: 'roByteArray',
                //children of EDID should be null because we encountered the elipses (...) which means it should be evaluated later
                children: [],
                highLevelType: 'array'
            }, {
                evaluateName: 'testNode["focusable"]',
                type: 'Boolean',
                value: 'false',
                name: 'focusable',
                children: undefined,
                highLevelType: 'primative'
            }, {
                evaluateName: 'testNode["focusedChild"]',
                name: 'focusedChild',
                type: 'roInvalid',
                value: 'roInvalid',
                children: undefined,
                highLevelType: HighLevelType.uninitialized
            }, {
                evaluateName: 'testNode["id"]',
                name: 'id',
                type: 'String',
                value: '""',
                children: undefined,
                highLevelType: 'primative'
            }, {
                evaluateName: 'testNode["mynewfield"]',
                type: 'roSGNode:ContentNode',
                name: 'mynewfield',
                children: [{
                    children: [],
                    evaluateName: 'testNode["mynewfield"].getChildren(-1,0)',
                    highLevelType: 'array',
                    name: '[[children]]',
                    type: 'roArray'
                }],
                highLevelType: 'object'
            }]);
        });
    });
});

describe('RequestPipeline', () => {
    let pipeline: RequestPipeline;
    let socket = {
        listeners: [],
        messageQueue: [] as Array<string[]>,
        addListener: function(eventName: string, listener: (data: Buffer) => void) {
            this.listeners.push(listener);
        },
        //custom function for tests used to emit data to listeners
        emit: function(data: string) {
            const buffer = Buffer.from(data);
            for (const listener of this.listeners) {
                listener(buffer);
            }
        },
        write: async function(text: string) {
            //flush messages after getting data written
            for (const messages of this.messageQueue) {
                for (const message of messages) {
                    await sleep(1);
                    this.emit(message);
                }
            }
        }
    };

    beforeEach(() => {
        socket.listeners = [];
        pipeline = new RequestPipeline(socket as any);
        pipeline['isAtDebuggerPrompt'] = true;
    });

    it('handles split debugger prompt messages', async () => {
        socket.messageQueue.push([
            'some text Brightsc',
            'ript Debugger>'
        ]);
        expect(
            await pipeline.executeCommand('doSomething', true)
        ).to.eql(
            'some text Brightscript Debugger>'
        );
    });

    it('handles debugger prompt separate from data', async () => {
        socket.messageQueue.push([
            'some text',
            ' Brightscript Debugger>'
        ]);
        expect(
            await pipeline.executeCommand('doSomething', true)
        ).to.eql(
            'some text Brightscript Debugger>'
        );
    });
});

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

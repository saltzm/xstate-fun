
import './styles.css';

import {inspect} from '@xstate/inspect';

inspect({iframe: () => document.querySelector('iframe[data-xstate]')});

// import './raft.js'
import {assign, interpret, Machine} from 'xstate';

const sendMessageToPeerMachine = Machine({
    id: 'peer',  // TODO
    initial: 'waitingForResponse',
    context: {result: undefined},
    states: {
        waitingForResponse: {
            on: {
                '*': {
                    target: 'done',
                    actions: assign({result: (_context, event) => event})
                }
            }
        },
        done: {
            type: 'final',
            data: {response: (context, _event) => context.result}
        }
    }
});

const candidateMachine = Machine(
    {
        id: 'candidate',
        initial: 'waitingForVotes',
        context: {
            numVotes: undefined,
            quorumSize: undefined
        },  // TODO best practice for defaults that are normally overridden?
        states: {
            waitingForVotes: {
                // invoke: {
                //    id: 'peer',
                //    src: sendMessageToPeerMachine,
                //    onDone: [{actions: 'recordVote'}]
                //},
                on: {VOTE: [{actions: 'recordVote'}]},
                always: {target: 'done', cond: 'receivedEnoughVotes'}
            },
            done: {type: 'final'},
        }
    },
    {
        actions: {
            recordVote: assign({
                numVotes: (context, event) => {
                    console.log(event);
                    // event.data.response.granted;
                    return event.granted ? context.numVotes + 1 :
                                           context.numVotes;
                }
            })

        },
        guards: {
            receivedEnoughVotes: (context, _event) => {
                console.log('Have some votes: ' + context.numVotes);
                return context.numVotes == context.quorumSize;
            }
        }
    });


// Stateless machine definition
// machine.transition(...) is a pure function used by the interpreter.A
const raftMachine = Machine(
    {
        id: 'raft',
        initial: 'follower',
        context: {
            currentTerm: 0,
            quorumSize: 2,  // TODO
            leader: '',
        },
        states: {
            follower: {
                after: {
                    ELECTION_TIMEOUT: 'candidate',
                },
                on: {HEARTBEAT: {target: 'follower'}}
            },
            candidate: {
                onEntry: 'incrementCurrentTerm',  // TODO vote for self
                after: {
                    ELECTION_TIMEOUT: 'candidate',
                },
                invoke: {
                    id: 'candidate',
                    src: candidateMachine,
                    onDone: 'leader',
                    autoForward: true,
                    data: {
                        numVotes: 0,
                        quorumSize: (context, _event) => context.quorumSize
                    }
                },
            },
            leader: {}
        },
        on: {
            '*': {
                target: 'follower',
                cond: 'receivedHigherTerm',
                actions: ['setNewTerm']
            },
        }
    },
    {
        guards: {
            receivedHigherTerm: (context, event) => {
                const result = event.term && event.term > context.currentTerm;
                if (result) {
                    console.log('Saw higher term');
                    console.log(event);
                    console.log('Context term: ' + context.currentTerm);
                }
                return result;
            },
        },
        actions: {
            incrementCurrentTerm: assign({
                currentTerm: (context, _event) => {
                    console.log('Incrementing term');
                    return context.currentTerm + 1;
                }
            }),
            setNewTerm: assign({
                currentTerm: (_context, event) => {
                    console.log('Setting new term');
                    console.log(event);
                    return event.term;
                }
            })
        },
        delays: {ELECTION_TIMEOUT: 100000000}
    });

const serverMachine = serverId => Machine({
    id: serverId,
    initial: 'running',
    states: {
        running: {
            invoke: {
                id: 'raft',
                src: raftMachine,
                onDone: 'done',
                autoForward: true,
            },
            on: {'SHUTDOWN': 'done'}
        },
        done: {type: 'final'}
    },
});

const logOnTransition = (state) => {
    console.log('Parent machine: ');
    console.log(state.value);
    if (state.children.raft) {
        console.log('Raft machine: ');
        console.log(state.children.raft.state.value);
        if (state.children.raft.children.candidate) {
            console.log('Raft machine: ');
            console.log(state.children.raft.children.candidate.state.value);
        }
    }
};

// Machine instance with internal state
const service = interpret(serverMachine('server'), {
                    devTools: true
                }).onTransition(logOnTransition);

service.start();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// function sleep(milliseconds) {
//    const date = Date.now();
//    let currentDate = null;
//    do {
//        currentDate = Date.now();
//    } while (currentDate - date < milliseconds);
//}
// Keep as follower for a while.
// service.send('HEARTBEAT');
// sleep(50)
//     .then(() => {
//         service.send('HEARTBEAT');
//         return sleep(50);
//     })
//     .then(() => {
//         service.send('HEARTBEAT');
//         return sleep(50);
//     })
//     .then(() => {
//         service.send('HEARTBEAT');
//         return sleep(2000);
//     })
//     .then(() => {
//         service.send({type: 'VOTE', term: 1, granted: true});
//         service.send({type: 'VOTE', term: 1, granted: true});
//         service.send({type: 'VOTE', term: 1, granted: true});
//         service.send({type: 'SHUTDOWN'});
//     });


'use strict'

//const mqtt = require('mqtt');
// switch to pre-compiled mqtt, since rollup can't compile the uncompiled one
// https://github.com/mqttjs/MQTT.js/issues/1206#issuecomment-725591504
const mqtt = require('mqtt/dist/mqtt.min.js')

class AsyncClient {
    constructor(client) {
        this._client = client;
        this.mque = [];
        this.promque = [];
        this._client.addListener('message', (top, msg) => xhandler(this, top, msg));
    }

    set handleMessage(newHandler) {
        this._client.handleMessage = newHandler;
    }

    get handleMessage() {
        return this._client.handleMessage;
    }

    get connected() {
        return this._client.connected;
    }

    get reconnecting() {
        return this._client.reconnecting;
    }

    publish(...args) {
        return new Promise((resolve, reject) => {
            this._client.publish(...args, (err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })
    }

    subscribe(...args) {
        return new Promise((resolve, reject) => {
            this._client.subscribe(...args, (err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })
    }

    unsubscribe(...args) {
        return new Promise((resolve, reject) => {
            this._client.unsubscribe(...args, (err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })
    }

    end(...args) {
        return new Promise((resolve, reject) => {
            this._client.end(...args, (err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })
    }

    reconnect(...args) {
        return this._client.reconnect(...args);
    }

    addListener(...args) {
        return this._client.addListener(...args);
    }

    emit(...args) {
        return this._client.emit(...args);
    }

    eventNames(...args) {
        return this._client.eventNames(...args);
    }

    getLastMessageId(...args) {
        return this._client.getLastMessageId(...args);
    }

    getMaxListeners(...args) {
        return this._client.getMaxListeners(...args);
    }

    listenerCount(...args) {
        return this._client.listenerCount(...args);
    }

    listeners(...args) {
        return this._client.listeners(...args);
    }

    off(...args) {
        return this._client.off(...args);
    }

    on(...args) {
        return this._client.on(...args);
    }

    once(...args) {
        return this._client.once(...args);
    }

    prependListener(...args) {
        return this._client.prependListener(...args);
    }

    prependOnceListener(...args) {
        return this._client.prependOnceListener(...args);
    }

    rawListeners(...args) {
        return this._client.rawListeners(...args);
    }

    removeAllListeners(...args) {
        return this._client.removeAllListeners(...args);
    }

    removeListener(...args) {
        return this._client.removeListener(...args);
    }

    removeOutgoingMessage(...args) {
        return this._client.removeOutgoingMessage(...args);
    }

    setMaxListeners(...args) {
        return this._client.setMaxListeners(...args);
    }
}


function xhandler(emitter, topic, message) {
    emitter.mque.push(message)
    resolveProms(emitter)
}
function resolveProms(emitter) {
    while (emitter.mque.length > 0 && emitter.promque.length > 0) {
        let resolvefunc = emitter.promque.shift()
        let msg = emitter.mque.shift()
        // msg should be uint8array
        var string = new TextDecoder("utf-8").decode(msg)
        resolvefunc(string)
    }
}


// Generate a Promise that listens only once for an event
/** 
 * @param {emitter} AsyncClient 
 * @param {event} string
*/
var oncePromise = (emitter, event) => {
    return new Promise(resolve => {
        emitter.promque.push(resolve)
        resolveProms(emitter) // if there are msgs in the queue, fire the promise now
    })
}


// Add an async iterator to all WebSockets
// @ts-ignore
AsyncClient.prototype[Symbol.asyncIterator] = async function* () {
    while ( this.connected) {
        yield (await oncePromise(this, 'message'));
    }
}


module.exports = {
    connect(brokerURL, opts) {
        const client = mqtt.connect(brokerURL, opts);
        const asyncClient = new AsyncClient(client);

        return asyncClient;
    },
    connectAsync(brokerURL, opts, allowRetries = true) {
        const client = mqtt.connect(brokerURL, opts);
        const asyncClient = new AsyncClient(client);

        return new Promise((resolve, reject) => {
            // Listeners added to client to trigger promise resolution
            const promiseResolutionListeners = {
                connect: (connack) => {
                    removePromiseResolutionListeners();
                    resolve(asyncClient);   // Resolve on connect
                },
                end: () => {
                    removePromiseResolutionListeners();
                    resolve(asyncClient);   // Resolve on end
                },
                error: (err) => {
                    removePromiseResolutionListeners();
                    client.end();
                    reject(err);            // Reject on error
                }
            };

            // If retries are not allowed, reject on close
            if (false === allowRetries) {
                promiseResolutionListeners.close = () => {
                    promiseResolutionListeners.error('Couldn\'t connect to server');
                }
            }

            // Remove listeners added to client by this promise
            function removePromiseResolutionListeners() {
                Object.keys(promiseResolutionListeners).forEach((eventName) => {
                    client.removeListener(eventName, promiseResolutionListeners[eventName]);
                });
            };

            // Add listeners to client
            Object.keys(promiseResolutionListeners).forEach((eventName) => {
                client.on(eventName, promiseResolutionListeners[eventName]);
            });
        });
    },
    AsyncClient
};

import { workerData, parentPort } from 'worker_threads';
import { generateIdentity } from './identity.js';
const { securityLevel } = workerData;
const identity = generateIdentity(securityLevel);
// Serialize: KeyObjects can't cross thread boundary, only send scalar data
parentPort.postMessage({
    privateKeyBigInt: identity.privateKeyBigInt.toString(),
    keyOffset: identity.keyOffset.toString(),
    publicKeyString: identity.publicKeyString,
    uid: identity.uid,
});
//# sourceMappingURL=identity-worker.js.map
import * as crypto from "crypto";
export interface IdentityData {
    privateKey: crypto.KeyObject;
    publicKey: crypto.KeyObject;
    privateKeyBigInt: bigint;
    publicKeyString: string;
    keyOffset: bigint;
    uid: string;
}
export declare function restoreIdentity(data: {
    privateKeyBigInt: string | bigint;
    keyOffset: string | bigint;
    publicKeyString: string;
    uid: string;
}): IdentityData;
export declare function fromTsIdentity(identityStr: string): IdentityData;
export declare function fromBase64Key(base64Key: string, keyOffset?: bigint): IdentityData;
export declare function generateIdentity(securityLevel?: number): IdentityData;
export declare function generateIdentityAsync(securityLevel?: number): Promise<IdentityData>;
export declare function exportPublicKeyString(pubKey: crypto.KeyObject): string;
export declare function getSharedSecret(privateKey: crypto.KeyObject, serverPublicKeyDer: Buffer): Buffer;
//# sourceMappingURL=identity.d.ts.map
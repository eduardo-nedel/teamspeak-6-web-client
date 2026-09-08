export declare function eaxEncrypt(key: Buffer, nonce: Buffer, header: Buffer, plaintext: Buffer, macLen?: number): {
    ciphertext: Buffer;
    mac: Buffer;
};
export declare function eaxDecrypt(key: Buffer, nonce: Buffer, header: Buffer, ciphertext: Buffer, mac: Buffer, macLen?: number): Buffer | null;
export declare function sha1(data: Buffer): Buffer;
export declare function sha256(data: Buffer): Buffer;
export declare function sha512(data: Buffer): Buffer;
export declare function xorBuffers(a: Buffer, b: Buffer): Buffer;
export declare function xorInto(a: Buffer, b: Buffer, len: number): void;
export declare const MAC_LEN = 8;
export declare const INIT_MAC: Buffer<ArrayBuffer>;
export declare const DUMMY_KEY: Buffer<ArrayBuffer>;
export declare const DUMMY_NONCE: Buffer<ArrayBuffer>;
export declare const INIT_VERSION = 1566914096;
export declare function hashPassword(password: string): string;
export declare function deriveKeyNonce(fromServer: boolean, packetId: number, generationId: number, packetType: number, ivStruct: Buffer): {
    key: Buffer;
    nonce: Buffer;
};
export declare function ecdsaSign(privateKeyDer: Buffer, data: Buffer): Buffer;
export declare function ecdsaVerify(publicKeyDer: Buffer, data: Buffer, signature: Buffer): boolean;
//# sourceMappingURL=crypto.d.ts.map
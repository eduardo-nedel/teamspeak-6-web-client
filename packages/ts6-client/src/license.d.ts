interface LicenseBlock {
    key: Buffer;
    hash: Buffer;
    type: number;
}
export declare function parseLicense(data: Buffer): LicenseBlock[];
export declare function deriveLicenseKey(blocks: LicenseBlock[]): Promise<Buffer>;
export declare function getSharedSecret2(serverDerivedKey: Buffer, tempPrivateKey: Buffer): Promise<Buffer>;
export declare function generateTemporaryKey(): Promise<{
    publicKey: Buffer;
    privateKey: Buffer;
}>;
export {};
//# sourceMappingURL=license.d.ts.map
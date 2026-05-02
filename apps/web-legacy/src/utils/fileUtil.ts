import * as crypto from 'crypto';

export function calculateFileHash(reader: FileReader, type: "sha256" | "sha512" = "sha256"): string {
    return crypto.createHash(type).update(new Uint8Array(reader.result)).digest("hex")
}
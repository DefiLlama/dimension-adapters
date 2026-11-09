// Cardano helpers on top of `sdk.chains.cardano` (Blockfrost; key from `BLOCKFROST_PROJECT_ID`,
// base url from `CARDANO_BLOCKFROST`). The sdk rotates endpoints, retries 5xx / 429 and caps
// concurrency.
import * as sdk from "@defillama/sdk";
import "./env"; // copies the repo's defaults (BLOCKFROST_PROJECT_ID, ...) into process.env for the sdk

const cardano = sdk.chains.cardano

// GET `path` (relative to the api root, query string allowed) from Blockfrost.
export async function blockfrost(path: string) {
    return cardano.blockfrost({ path });
}

export async function getAddressTransactionsBetween(address: string, start: number, end: number) {
    const [fromBlock, toBlock] = await Promise.all([
        cardano.getBlockAtTimestamp({ timestamp: start }),
        cardano.getBlockAtTimestamp({ timestamp: end }),
    ]);
    const txs = await cardano.getAddressTransactions({ address, from: fromBlock.number, to: toBlock.number });
    return txs.filter(tx => tx.block_time >= start && tx.block_time < end);
}

// ADA received by `address` in transactions with `start <= block_time <= end`, in ADA.
export async function getAdaReceived(
    start: number,
    end: number,
    address: string
): Promise<number> {
    const [fromBlock, toBlock] = await Promise.all([
        cardano.getBlockAtTimestamp({ timestamp: start }),
        cardano.getBlockAtTimestamp({ timestamp: end }),
    ]);
    const txs = await cardano.getAddressTransactions({ address, from: fromBlock.number, to: toBlock.number });

    let totalLovelace = 0;
    for (const tx of txs) {
        if (tx.block_time < start || tx.block_time > end) continue;

        const utxos = await cardano.getTxUtxos({ txHash: tx.tx_hash });

        for (const output of utxos.outputs) {
            if (output.address !== address) continue;

            const ada = output.amount.find((a: any) => a.unit === "lovelace");

            if (ada) {
                totalLovelace += Number(ada.quantity);
            }
        }
    }

    return totalLovelace / 1_000_000;
}

// Decoded Plutus data: integers as bigint, bytestrings as hex, constructors as { constructor, fields }.
export type PlutusData =
    | bigint
    | string
    | PlutusData[]
    | { constructor: number; fields: PlutusData[] }
    | { map: [PlutusData, PlutusData][] };

// Decode a CBOR-encoded Plutus datum (e.g. Blockfrost's `inline_datum` hex) without an extra Blockfrost call.
export function decodePlutusData(hex: string): PlutusData {
    const buf = Buffer.from(hex, "hex");
    let pos = 0;
    const readArg = (info: number): bigint => {
        if (info < 24) return BigInt(info);
        if (info === 24) return BigInt(buf.readUInt8(pos++));
        if (info === 25) { const v = buf.readUInt16BE(pos); pos += 2; return BigInt(v); }
        if (info === 26) { const v = buf.readUInt32BE(pos); pos += 4; return BigInt(v); }
        if (info === 27) { const v = buf.readBigUInt64BE(pos); pos += 8; return v; }
        throw new Error(`Unsupported CBOR length encoding ${info} in Plutus datum`);
    };
    const readItems = (info: number, read: () => any) => {
        const items: any[] = [];
        if (info === 31) {
            while (buf[pos] !== 0xff) items.push(read());
            pos++; // break byte
        } else {
            const n = Number(readArg(info));
            for (let i = 0; i < n; i++) items.push(read());
        }
        return items;
    };
    const read = (): PlutusData => {
        const initial = buf.readUInt8(pos++);
        const major = initial >> 5;
        const info = initial & 31;
        switch (major) {
            case 0: return readArg(info);
            case 1: return -1n - readArg(info);
            case 2: {
                if (info === 31) return readItems(info, read).join(""); // chunked bytestring
                const n = Number(readArg(info));
                const bytes = buf.subarray(pos, pos + n).toString("hex");
                pos += n;
                return bytes;
            }
            case 4: return readItems(info, read);
            case 5: return { map: readItems(info, () => [read(), read()]) };
            case 6: {
                const tag = Number(readArg(info));
                if (tag === 2 || tag === 3) { // bignum
                    const magnitude = BigInt("0x" + ((read() as string) || "0"));
                    return tag === 2 ? magnitude : -1n - magnitude;
                }
                const value = read() as any;
                if (tag >= 121 && tag <= 127) return { constructor: tag - 121, fields: value };
                if (tag >= 1280 && tag <= 1400) return { constructor: tag - 1280 + 7, fields: value };
                if (tag === 102) return { constructor: Number(value[0]), fields: value[1] };
                throw new Error(`Unsupported CBOR tag ${tag} in Plutus datum`);
            }
            default:
                throw new Error(`Unsupported CBOR major type ${major} in Plutus datum`);
        }
    };
    return read();
}

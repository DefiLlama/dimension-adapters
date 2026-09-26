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

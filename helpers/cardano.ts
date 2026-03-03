import { httpGet } from "../utils/fetchURL";
import { getEnv } from "./env";

async function blockfrost(path: string) {
    return httpGet(`https://cardano-mainnet.blockfrost.io/api/v0${path}`, {
        headers: {
            project_id: getEnv("BLOCKFROST_PROJECT_ID"),
        },
    });
}

export async function getAdaReceived(
    start: number,
    end: number,
    address: string
): Promise<number> {
    let page = 1;
    let totalLovelace = 0;

    while (true) {
        const txs = await blockfrost(
            `/addresses/${address}/transactions?page=${page}&order=desc`
        );

        if (!txs || txs.length === 0) break;

        for (const tx of txs) {
            const blockTime = tx.block_time;

            if (blockTime < start) {
                return totalLovelace / 1_000_000;
            }

            if (blockTime > end) continue;

            const utxos = await blockfrost(`/txs/${tx.tx_hash}/utxos`);

            for (const output of utxos.outputs) {
                if (output.address !== address) continue;

                const ada = output.amount.find(
                    (a: any) => a.unit === "lovelace"
                );

                if (ada) {
                    totalLovelace += Number(ada.quantity);
                }
            }
        }

        page++;
    }

    return totalLovelace / 1_000_000;
}
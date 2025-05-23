import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
    const fees = await queryDuneSql(options, `
        SELECT SUM(amount) AS fees_sol
        FROM tokens_solana.transfers
        WHERE outer_executing_account = 'VFeesufQJnGunv2kBXDYnThT1CoAYB45U31qGDe5QjU'
            AND token_mint_address = 'So11111111111111111111111111111111111111112' 
            AND block_time >= TIMESTAMP '2024-09-01 00:00'
            AND TIME_RANGE
            AND tx_signer <> 's1gnrNn3b3zs1MCAGYzXsBn13v41HP9nq4JZZGpLESL'`)
    const dailyFees = options.createBalances()
    dailyFees.add("So11111111111111111111111111111111111111112", fees[0].fees_sol)
    return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
        },
    }
};

export default adapter;
import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import coreAssets from "../../helpers/coreAssets.json"
import { CHAIN } from "../../helpers/chains";


async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const query = `
        WITH trades AS (
        SELECT
            tx_hash,
            varbinary_substring(topic2, 13, 20) AS trader
        FROM megaeth.logs
        WHERE contract_address = 0x12759afca690637b425ffba3265f0dc2f6242a8d
            AND topic0 = 0x9f039a0ca58d6157d7b6914e2d60cedacf65fea21a365e93d708a5e5c25454f3
            AND block_time >= DATE '2026-05-26' AND block_time < DATE '2026-05-27'
        )

        SELECT
        SUM(tf.amount_raw) AS volume
        FROM trades t
        JOIN tokens.transfers tf
        ON tf.blockchain = 'megaeth'
        AND tf.tx_hash = t.tx_hash
            AND tf.block_time >= DATE '2026-05-26' AND tf.block_time < DATE '2026-05-27'
        AND tf.contract_address = 0xfafddbb3fc7688494971a79cc65dca3ef82079e7
        AND tf."to" = 0x12759afca690637b425ffba3265f0dc2f6242a8d
        AND tf."from" = t.trader`;
    const res = await queryDuneSql(options, query)
    const dailyVolume = options.createBalances()
    dailyVolume.add(coreAssets.megaeth.USDm, res.volume ?? 0)
    return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2025-09-19',
  chains: [CHAIN.MEGAETH],
  dependencies: [Dependencies.DUNE],
}

export default adapter
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const ALLIUM_QUERY = (fromTime: string, toTime: string) => `
  SELECT
    DATE(checkpoint_timestamp) AS date,
    coin_type,
    SUM(amount::DOUBLE) AS total_amount_transferred -- Balance change can be negative OR position. 
  FROM
    sui.raw.balance_changes
  WHERE
    (checkpoint_timestamp, transaction_block_digest) IN (
      SELECT
        checkpoint_timestamp,
        transaction_block_digest
      FROM
        sui.raw.events
      WHERE
        type IN (
            '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::events::BlobCertified',
            '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::events::BlobRegistered'
        ) 
        AND checkpoint_timestamp >= '${fromTime}'
        AND checkpoint_timestamp <= '${toTime}'
        -- AND transaction_block_status = 'success' -- Failed transactions also burn fees.
    )
    AND checkpoint_timestamp >= '${fromTime}'
    AND checkpoint_timestamp <= '${toTime}'
  GROUP BY 
    ALL
  ORDER BY
    date DESC,
    total_amount_transferred DESC;

`

const fetch: any = async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const fromTime = new Date(timestamp * 1000).toISOString().split('T')[0]
  const toTime = new Date((timestamp + 24 * 3600) * 1000).toISOString().split('T')[0]
  
  const query = ALLIUM_QUERY(fromTime, toTime)
  const checkpoints = await queryAllium(query)
  for(const checkpoint of checkpoints) {
    if (checkpoint.date === fromTime) {
      dailyFees.add(checkpoint.coin_type, Math.abs(checkpoint.total_amount_transferred))
    }
  }

  return {
    dailyFees: dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology: {
    Fees: 'Daily fees paid bu users which will be burned.',
    UserFees: 'Daily fees paid bu users which will be burned.',
    Revenue: 'Daily fees paid bu users which will be burned.',
  },
  chains: [CHAIN.SUI],
}

export default adapter;

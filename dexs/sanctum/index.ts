import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const chainConfig: Record<string, { start: string; reserveAccount: string; feeAccount: string }> = {
  [CHAIN.SOLANA]: {
    start: "2022-07-14",
    reserveAccount: "3rBnnH9TTgd3xwu48rnzGsaQkSr1hR64nY71DrDt6VrQ",
    feeAccount: "5Pcu8WeQa3VbBz2vdBT49Rj4gbS4hsnfzuL1LmuRaKFY",
  },
}

const fetch = async (options: FetchOptions) => {
  const { reserveAccount, feeAccount } = chainConfig[options.chain];
  const [row] = await queryDuneSql(options, `
    SELECT COALESCE(SUM(-reserve.balance_change), 0) AS sol_dispensed
    FROM solana.account_activity reserve
    WHERE TIME_RANGE
      AND reserve.tx_success
      AND reserve.address = '${reserveAccount}'
      AND reserve.balance_change < 0
      AND EXISTS (
        SELECT 1
        FROM solana.account_activity fee
        WHERE TIME_RANGE
          AND fee.tx_success
          AND fee.tx_id = reserve.tx_id
          AND fee.address = '${feeAccount}'
      )
  `);

  const dailyVolume = options.createBalances();
  dailyVolume.add(ADDRESSES.solana.SOL, row?.sol_dispensed);

  return { dailyVolume };
};


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;

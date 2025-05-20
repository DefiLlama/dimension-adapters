import ADDRESSES from './coreAssets.json'
import { ChainBlocks, FetchOptions, FetchResultFees, } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { queryIndexer, toByteaArray } from "../helpers/indexer";

const feeWallet = '0x4200000000000000000000000000000000000011';
const l1FeeVault = '0x420000000000000000000000000000000000001a';
const baseFeeVault = '0x4200000000000000000000000000000000000019';

async function getFees(options: FetchOptions, { feeVaults, gasToken }: { feeVaults: string[], gasToken?: string }) {
  const { api, fromApi, createBalances, getLogs } = options;
  const balances = createBalances();
  const eventAbi = 'event Withdrawal(uint256 value, address to, address from)'

  await api.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })
  await fromApi.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })

  const logs = await getLogs({ targets: feeVaults, eventAbi, })

  logs.map((log) => {
    if (gasToken)
      balances.addTokenVannila(gasToken, log.value)
    else
      balances.addGasToken(log.value)
  })

  balances.addBalances(api.getBalancesV2())
  balances.subtract(fromApi.getBalancesV2())
  return balances
}

export function L2FeesFetcher({
  feeVaults = [feeWallet, l1FeeVault, baseFeeVault],
  ethereumWallets,
  gasToken,
}: {
  gasToken?: string;
  feeVaults?: string[];
  ethereumWallets: string[];
}): any {
  return async (options: FetchOptions) => {
    const sequencerGas = queryIndexer(`
            SELECT
                sum(ethereum.transactions.gas_used * ethereum.transactions.gas_price) AS sum
            FROM
                ethereum.transactions
                INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
            WHERE (to_address IN ${toByteaArray(ethereumWallets)}) AND (block_time BETWEEN llama_replace_date_range);
                `, options);
    const [dailyFees, totalSpentBySequencer] = await Promise.all([getFees(options, { feeVaults, gasToken }), sequencerGas]);
    const dailyRevenue = dailyFees.clone()
    if (gasToken)
      dailyRevenue.addTokenVannila(gasToken, (totalSpentBySequencer as any)[0].sum * -1)
    else
      dailyRevenue.addGasToken((totalSpentBySequencer as any)[0].sum * -1)
    return { dailyFees, dailyRevenue, }
  }
}

export interface DuneFeeOptions {
    chainName: string;
    ethereumWallets: string[];
    blobSubmitterLabel: string;
}

export const fetchL2FeesWithDune = async (options: FetchOptions, feeParams: DuneFeeOptions) => {
    const { startTimestamp, endTimestamp, createBalances } = options;
    const { chainName, ethereumWallets, blobSubmitterLabel } = feeParams;

    const walletsString = ethereumWallets.map(w => `${w.toLowerCase()}`).join(',');

    const query = `
        WITH total_tx_fees_cte AS (
            SELECT
                SUM(tx_fee_raw / 1e18) AS total_tx_fees
            FROM gas.fees
            WHERE blockchain = '${chainName}'
                AND block_time >= from_unixtime(${startTimestamp})
                AND block_time <= from_unixtime(${endTimestamp})
            ),
            total_calldata_costs_cte AS (
            SELECT
                SUM(t.gas_used * (CAST(t.gas_price AS DOUBLE) / 1e18)) AS calldata_cost
            FROM
                ethereum.transactions t
            WHERE t.to IN (${walletsString})
                AND t.block_time >= from_unixtime(${startTimestamp})
                AND t.block_time <= from_unixtime(${endTimestamp})
            ),
            total_blob_costs_cte AS (
            SELECT
                SUM((CAST(b.blob_base_fee AS DOUBLE) / 1e18) * b.blob_gas_used) AS blob_cost
            FROM ethereum.blobs_submissions b
            WHERE b.blob_submitter_label = '${blobSubmitterLabel}'
                AND b.block_time >= from_unixtime(${startTimestamp}) /* blobs data often starts later */
                AND b.block_time <= from_unixtime(${endTimestamp})
            )
        SELECT
            COALESCE((SELECT total_tx_fees FROM total_tx_fees_cte), 0) AS total_fee,
            COALESCE((SELECT calldata_cost FROM total_calldata_costs_cte), 0) +
            COALESCE((SELECT blob_cost FROM total_blob_costs_cte), 0) AS total_cost,
            (COALESCE((SELECT total_tx_fees FROM total_tx_fees_cte), 0)) -
            (COALESCE((SELECT calldata_cost FROM total_calldata_costs_cte), 0) +
            COALESCE((SELECT blob_cost FROM total_blob_costs_cte), 0)) AS total_revenue
        `;

    const feesResult: any[] = await queryDuneSql(options, query);

    const dailyFees = createBalances();
    const dailyRevenue = createBalances();

    dailyFees.addGasToken(feesResult[0].total_fee * 1e18);
    dailyRevenue.addGasToken(feesResult[0].total_revenue * 1e18);

    return { dailyFees, dailyRevenue };
}; 
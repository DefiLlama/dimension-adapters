import ADDRESSES from './coreAssets.json'
import { ChainBlocks, FetchOptions, FetchResultFees, } from "../adapters/types";
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
  return async (timestamp: number, _chainBlocks: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
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
    return { timestamp, dailyFees, dailyRevenue, }
  }
}

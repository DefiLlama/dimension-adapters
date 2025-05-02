import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { Adapter, ChainBlocks, FetchOptions, FetchResultFees, ProtocolType } from "../adapters/types";
import { queryFlipside } from "../helpers/flipsidecrypto";

async function getFees(options: FetchOptions) {

  const feeWallet = '0x4200000000000000000000000000000000000011';
  const l1FeeVault = '0x420000000000000000000000000000000000001a';
  const baseFeeVault = '0x4200000000000000000000000000000000000019';
  const feeVaults = [l1FeeVault, baseFeeVault, feeWallet];

  const { api, fromApi, createBalances, getLogs } = options;
  const balances = createBalances();
  const eventAbi = 'event Withdrawal (uint256 value, address to, address from, uint8 withdrawalNetwork)'

  await api.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })
  await fromApi.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })

  const logs = await getLogs({ targets: feeVaults, eventAbi, })

  logs.map((log) => balances.addGasToken(log.value))
  balances.addBalances(api.getBalancesV2())
  balances.subtract(fromApi.getBalancesV2())
  return balances
}

const fetch = async (timestamp: number, _chainBlocks: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const { getFromBlock, getToBlock, } = options
  const query = `
          select
            SUM(TX_FEE)
          from
            bsc.core.fact_transactions
          WHERE (to_address = '0x153cab79f4767e2ff862c94aa49573294b13d169')
          and BLOCK_NUMBER > ${await getFromBlock()} AND BLOCK_NUMBER < ${await getToBlock()}
        `

  const cost_to_l1: number[] = (await queryFlipside(query, 260)).flat();
  const dailyFees = await getFees(options)
  const dailyRevenue = dailyFees.clone();
  dailyRevenue.addGasToken((cost_to_l1[0] ?? 0) * 1e18 * -1)

  return { timestamp, dailyFees, dailyRevenue }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OP_BNB]: {
      fetch: fetch as any,
      start: '2023-08-14',
      runAtCurrTime: true,
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  allowNegativeValue: true, // sequencer fees
}

export default adapter;

import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, } from "../adapters/types";
import { getTokenDiff } from "../helpers/token";
import { queryIndexer } from "../helpers/indexer";

const dispatcher: any = {
  [CHAIN.ETHEREUM]: "0x2ff99ee6b22aedaefd8fd12497e504b18983cb14",
  [CHAIN.BSC]: "0x7176456e98443a7000b44e09149a540d06733965",
  [CHAIN.ARBITRUM]: "0x34b5561c30a152b5882c8924973f19df698470f4",
}
const feesAddress = '0xB0999731f7c2581844658A9d2ced1be0077b7397'

async function fetch(timestamp: number, _1: any, options: FetchOptions) {
  const dailyFees = options.createBalances()
  await getTokenDiff({ options, target: feesAddress, balances: dailyFees, tokens: [] })
  const logs = await options.getLogs({ target: dispatcher[options.chain], eventAbi: 'event BalanceTransfer (address to, uint256 amount)', })
  logs.map((log: any) => dailyFees.addGasToken(log.amount))
  if (CHAIN.ETHEREUM === options.chain) {
    const eth_out: any = await queryIndexer(`
    SELECT
      sum("value") / 1e18 AS eth_out
    FROM
      ethereum.transactions
    WHERE
        from_address = '\\xB0999731f7c2581844658A9d2ced1be0077b7397'
        AND data = '\\x'
        AND block_time BETWEEN llama_replace_date_range;
    `, options);
    dailyFees.addGasToken(eth_out[0].eth_out * 1e18)
  }
  return { timestamp, dailyFees, dailyRevenue: dailyFees, }
}

const chainAdapter = { fetch: fetch as any, start: 1656633600, }

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: chainAdapter,
    [CHAIN.BSC]: chainAdapter,
    [CHAIN.ARBITRUM]: chainAdapter,
  }
}

export default adapter;

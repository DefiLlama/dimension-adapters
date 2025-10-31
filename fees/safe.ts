import { Adapter, FetchOptions, } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryIndexer } from '../helpers/indexer';

function getFeeRecipient(timestamp: number) {
  // new recipient migration
  // https://etherscan.io/tx/0x69c53420e8d37122a5513896c7953e6963eea000f45f3698d50d891f56b48ab9
  if (timestamp <= 1743465600) {
    return '63695Eee2c3141BDE314C5a6f89B98E62808d716'
  } else {
    return 'E344241493D573428076c022835856a221dB3E26'
  }
}

// this address hold CowSwap fees for partner: https://etherscan.io/address/0xa03be496e67ec29bc62f01a428683d7f9c204930
// order example https://explorer.cow.fi/orders/0x6926d210ec9c5a9acb36db99842b10cd9ad328d391fcc42d23cf49bfb1b17720d7f876620bdff1c9aba5b444128d1722ddd678b367083dfb?tab=overview
const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const eth_transfer_logs: any = await queryIndexer(`
  SELECT
    sum("value") AS eth_value
  FROM
    ethereum.traces
  WHERE
    to_address = '\\x${getFeeRecipient(options.fromTimestamp)}'
    AND block_time BETWEEN llama_replace_date_range;
    `, options);
  eth_transfer_logs.map((e: any) => dailyFees.addGasToken(e.eth_value ?? 0))
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
    },
  },
  methodology: {
    Fees: 'All buy/sell fees paid by users for using Safe to trade tokens on CowSwap.',
    Revenue: 'All fees are collected by Safe.',
    ProtocolRevenue: 'All fees are collected by Safe.',
  }
}

export default adapter;

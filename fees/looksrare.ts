import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const address = "0x0000000000e655fae4d56241588680f86e3b2377";
const topic0_taker_bid = "0x3ee3de4684413690dee6fff1a0a4f92916a1b97d1c5a83cdf24671844306b2e3";
const topic0_taker_ask = "0x9aaa45d6db2ef74ead0751ea9113263d1dec1b50cea05f0ca2002cb8063564a4";
const eventAbis = {
  "TakerAsk": "event TakerAsk((bytes32 orderHash, uint256 orderNonce, bool isNonceInvalidated) nonceInvalidationParameters, address askUser, address bidUser, uint256 strategyId, address currency, address collection, uint256[] itemIds, uint256[] amounts, address[2] feeRecipients, uint256[3] feeAmounts)",
  "TakerBid": "event TakerBid((bytes32 orderHash, uint256 orderNonce, bool isNonceInvalidated) nonceInvalidationParameters, address bidUser, address bidRecipient, uint256 strategyId, address currency, address collection, uint256[] itemIds, uint256[] amounts, address[2] feeRecipients, uint256[3] feeAmounts)",
}

const fetch = async ({ createBalances, getLogs, }: FetchOptions) => {

  const logs_bid = await getLogs({
    target: address,
    topics: [topic0_taker_bid],
    eventAbi: eventAbis.TakerBid
  })

  const logs_ask = await getLogs({
    target: address,
    topics: [topic0_taker_ask],
    eventAbi: eventAbis.TakerAsk,
  })
  const logs = logs_bid.concat(logs_ask)
  const dailyFees = createBalances()
  logs.map((tx: any) => {
    dailyFees.add(tx.currency, tx.feeAmounts[2])
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2021-12-29',
    },
  },
  methodology: {
    Fees: "NFT trading fees paid by users.",
    Revenue: "100% fees are revenue to LOOKS token holders.",
    HoldersRevenue: "100% revenue distributed to LOOKS token holders.",
  }
}

export default adapter;

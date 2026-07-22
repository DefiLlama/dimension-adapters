import {
  FetchOptions,
  FetchResultV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Prophet Market is an on-chain prediction market on Polygon where outcomes are settled
// through AI-powered resolution. Each trade settles through an `OrderFilled` event on the
// ProphetCTFExchange, where one leg is native USDC collateral (asset id 0) and the
// other is an ERC-1155 outcome token (a non-zero id).
//
// Volume = the USDC leg of every OrderFilled. Prophet's order flow is almost entirely
// complementary mint/merge matches: the two counterparties of a trade pay different
// USDC amounts for opposite outcomes (YES/NO), and those two USDC legs sum to the
// collateral of one complete set. So summing every USDC leg yields the true notional
// traded — this must NOT be divided by 2 (that would halve genuine mint/merge volume).
// This mirrors Polymarket's production adapter, which likewise sums the USDC leg of
// all OrderFilled events without dividing.

const EXCHANGE_ADDRESS = "0x127aD3A6e55EbBDaecC0eaeb12615879611e1839"; // ProphetCTFExchange
const USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"; // native Circle USDC on Polygon

const ORDER_FILLED_ABI =
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, " +
  "uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    targets: [EXCHANGE_ADDRESS],
    eventAbi: ORDER_FILLED_ABI,
    onlyArgs: true,
  });

  for (const log of logs) {
    // Count the USDC leg only: asset id 0 is collateral (USDC), any non-zero id is an outcome token.
    if (BigInt(log.makerAssetId) === 0n)
      dailyVolume.add(USDC, log.makerAmountFilled);
    else if (BigInt(log.takerAssetId) === 0n)
      dailyVolume.add(USDC, log.takerAmountFilled);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "USDC notional traded through OrderFilled events on Prophet's CTF exchange. Each trade's USDC leg " +
      "(the side with asset id 0) is summed; complementary mint/merge legs sum to the collateral of a complete " +
      "set, so the raw sum is the true notional and is not divided.",
  },
  chains: [CHAIN.POLYGON],
  start: 1777608094, // block 86244025, ProphetCTFExchange deployment (2026-05-01)
  fetch,
};

export default adapter;

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const FEE_RECIPIENT = "0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const data = await fetchURL(
    `https://tonapi.io/v2/blockchain/accounts/${FEE_RECIPIENT}/transactions?limit=1000&start_date=${options.startTimestamp}&end_date=${options.endTimestamp}`
  );

  const totalFees = data.transactions.reduce((acc: number, currTxn: any) => acc + currTxn.in_msg.value, 0);
  dailyFees.addGasToken(totalFees);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "1% fee on lending, DEX swaps, cross-chain swaps, perps, staking, and NFT marketplace",
  Revenue: "All the fees are revenue",
  ProtocolRevenue: "All the revnue goes to protocol"
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  start: '2025-01-04',
  methodology,
};

export default adapter;

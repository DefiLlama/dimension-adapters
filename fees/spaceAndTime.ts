import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from "axios";

const SXT_ETH_KEY = "ethereum:0xE6Bfd33F52d82Ccb5b37E16D3dD81f9FFDAbB195";

const getGasBurned = async (startTimestamp: number, endTimestamp: number) => {
  const response = await axios.get<{ gasBurned: string }>(
    "https://metrics.spaceandtime.dev/defillama/gas-burned",
    {
      params: { start: startTimestamp, end: endTimestamp },
    },
  );
  return response.data.gasBurned;
};

const getPayPortalFees = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: "0x84C276C3EC3Dd3F67F51B775a53001c9d5017964",
    eventAbi:
      "event TransferWithFee(address indexed sender, address indexed recipient, uint256 netAmount, uint256 fee)",
  });
  return Number(logs.reduce((sum, log) => sum + log.fee, 0n));
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  if (options.chain === CHAIN.BASE) {
    const payPortalFees = await getPayPortalFees(options);
    dailyFees._balances[SXT_ETH_KEY] = payPortalFees;
    dailyRevenue._balances[SXT_ETH_KEY] = payPortalFees;
  } else if (options.chain === CHAIN.SPACE_AND_TIME) {
    dailyFees._balances[SXT_ETH_KEY] = await getGasBurned(
      options.startTimestamp,
      options.endTimestamp,
    );
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const methodology = {
  Fees: "Gas fees paid on the Space and Time chain for verifiable compute queries, plus transfer fees from PayPortal on Base.",
  Revenue:
    "PayPortal transfer fees on Base. Gas fees on Space and Time are distributed to validators, not retained as protocol revenue.",
  ProtocolRevenue:
    "100% of PayPortal fees on Base go to the protocol treasury.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SPACE_AND_TIME, CHAIN.BASE],
  start: "2025-04-30",
  methodology,
};

export default adapter;

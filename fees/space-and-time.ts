import * as sdk from "@defillama/sdk";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { getBlock } from "../helpers/getBlock";

const getGasBurned = async (startTimestamp: number, endTimestamp: number) => {
  const data = await httpGet(
    "https://metrics.spaceandtime.dev/defillama/gas-burned",
    {
      params: { start: startTimestamp, end: endTimestamp },
    },
  );
  return data.gasBurned;
};

const getPayPortalFees = async (startTimestamp: number, endTimestamp: number) => {
  const fromBlock = await getBlock(startTimestamp, CHAIN.BASE)
  const toBlock = await getBlock(endTimestamp, CHAIN.BASE)
  const logs = await sdk.getEventLogs({
    chain: CHAIN.BASE,
    fromBlock,
    toBlock,
    target: "0x84C276C3EC3Dd3F67F51B775a53001c9d5017964",
    eventAbi:"event TransferWithFee(address indexed sender, address indexed recipient, uint256 netAmount, uint256 fee)",
  });
  return Number(logs.reduce((sum, log) => sum + log.fee, 0n));
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  
  // gas fees paid on space and time blockchain
  const gasBurned = await getGasBurned(options.startTimestamp, options.endTimestamp);

  // PayPortal transfer fees on Base
  const payPortalFees = await getPayPortalFees(options.startTimestamp, options.endTimestamp);

  dailyFees.addCGToken('space-and-time', Number(gasBurned) / 1e18);
  dailyFees.addCGToken('space-and-time', Number(payPortalFees) / 1e18);
  dailyRevenue.addCGToken('space-and-time', Number(payPortalFees) / 1e18);
  
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const methodology = {
  Fees: "Gas fees paid on the Space and Time chain for verifiable compute queries, plus transfer fees from PayPortal on Base.",
  Revenue: "PayPortal transfer fees on Base. Gas fees on Space and Time are distributed to validators, not retained as protocol revenue.",
  ProtocolRevenue: "100% of PayPortal fees on Base go to the protocol treasury.",
};

const adapter: SimpleAdapter = {
  fetch,
  protocolType: ProtocolType.CHAIN,
  chains: [CHAIN.SPACE_AND_TIME],
  start: "2025-05-01",
  methodology,
};

export default adapter;

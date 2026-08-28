import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Source: https://docs.aelf.io/en/latest/reference/acs/acs1.html
// 10% of the fees are destroyed.
// 90% goes to the dividend pool on the main chain and to the FeeReceiver on the side chain.
// If the SideChain has no FeeReceiver set, ALL fees are burned.
const MAIN_CHAIN_BURN_RATIO = 0.1;
const FEE_URL = "https://aelfscan.io/api/app/statistics/dailyTxFee";
const BURNT_URL = "https://aelfscan.io/api/app/statistics/dailyTotalBurnt";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const [feeResponse, burntResponse] = await Promise.all([
    fetchURL(FEE_URL),
    fetchURL(BURNT_URL),
  ]);

  const feeRow = feeResponse.data.list.find((item: any) => item.dateStr === options.dateString);
  const burntRow = burntResponse.data.list.find((item: any) => item.dateStr === options.dateString);
  if (!feeRow || !burntRow) throw new Error(`No aelf fee/burnt data found for ${options.dateString}`);

  const mainChainBurn = Number(feeRow.mainChainTotalFeeElf) * MAIN_CHAIN_BURN_RATIO;
  const sideChainBurn = Number(burntRow.sideChainBurnt);

  dailyFees.addCGToken("aelf", Number(feeRow.mergeTotalFeeElf), "Transaction Fees");
  dailyRevenue.addCGToken("aelf", mainChainBurn + sideChainBurn, "Burned Fees");

  return { dailyFees, dailyRevenue };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.AELF],
  protocolType: ProtocolType.CHAIN,
  start: "2020-12-10",
  methodology: {
    Fees: "Transaction fees paid by users on aelf Main chain and Side chain.",
    Revenue: "Transaction fees burned by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      "Transaction Fees": "Total transaction fees paid by users across aelf Main chain and Side chain.",
    },
    Revenue: {
      "Burned Fees": "Portion of transaction fees burned by the protocol on both chains.",
    },
  },
};

export default adapter;

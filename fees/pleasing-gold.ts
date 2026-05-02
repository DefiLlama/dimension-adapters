import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const PSWAP_CONTRACT = "0x3D084Fc4Cc4D5A0B8d6B6517341f359505b35336";
const PGOLD = "0x3e76BB02286BFeAA89DD35f11253f2CbCE634F91";
// PUSD is pegged 1:1 to USDT on Arbitrum
const PUSD = "0xc8fb643d18f1e53698cfda5c8fdf0cdc03c1dbec";

const swapPGOLDToPUSD = "event SwapPGOLDToPUSD(address indexed user, uint256 inAmount, uint256 outAmount, uint256 fee)";
const swapPUSDToPGOLD = "event SwapPUSDToPGOLD(address indexed user, uint256 inAmount, uint256 outAmount, uint256 fee)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const [logs1, logs2] = await Promise.all([
    options.getLogs({ target: PSWAP_CONTRACT, eventAbi: swapPGOLDToPUSD }),
    options.getLogs({ target: PSWAP_CONTRACT, eventAbi: swapPUSDToPGOLD }),
  ]);

  // SwapPGOLDToPUSD: fee is in PUSD (18 decimals, USD-pegged)
  for (const log of logs1) {
    dailyFees.add(PUSD, log.fee);
  }

  // SwapPUSDToPGOLD: fee is in PGOLD
  for (const log of logs2) {
    dailyFees.add(PGOLD, log.fee);
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-10-29',
    }
  },
  methodology: {
    Fees: "Fees collected on PGOLD<>PUSD swaps via the Pleasing Golden spot market.",
    Revenue: "All swap fees go to the protocol.",
  }
};

export default adapter;

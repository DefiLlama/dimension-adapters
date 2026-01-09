import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainConfig: { [chain: string]: { address: string, start: string } } = {
  [CHAIN.HYPERLIQUID]: { address: "0x0095aCDD705Cfcc11eAfFb6c19A28C0153ad196F", start: "2025-09-16" },
  [CHAIN.BASE]: { address: "0x68893915f202e5DA2Ef01493463c50B2f68Df56d", start: "2025-10-01" },
};

const TRADE_EVENT_ABI = "event Trade(address account, address referrer, uint256 totalPremium, uint256 totalFee, uint256 totalNotional, uint256 underlyingPrice, (int256 amount, int256 premium, uint256 fee, address oToken)[] legs)";

const fetch = async (options: FetchOptions) => {
  const hedgedPoolAddress = chainConfig[options.chain].address;

  const logs = await options.getLogs({
    target: hedgedPoolAddress,
    eventAbi: TRADE_EVENT_ABI,
  });

  let dailyNotionalVolume = 0;
  let dailyPremiumVolume = 0;
  let dailyFees = 0;

  const totalNotionalMap = new Map();

  for (const { totalPremium, totalNotional, totalFee, legs, underlyingPrice } of logs) {
    dailyPremiumVolume += Number(totalPremium) / 1e6;
    const { oToken } = legs[0];
    const accumulatedNotionalInUsd = totalNotionalMap.get(oToken) || 0;
    totalNotionalMap.set(oToken, accumulatedNotionalInUsd + (Number(totalNotional) * Number(underlyingPrice)))
    dailyFees += Number(totalFee) / 1e6;
  }

  const oTokenDecimals = await options.api.multiCall({
    abi: 'uint8:decimals',
    calls: [...totalNotionalMap.keys()]
  });

  let index = 0;
  for (const [_oToken, accumulatedNotional] of totalNotionalMap.entries()) {
    dailyNotionalVolume += (accumulatedNotional / (10 ** (oTokenDecimals[index] * 2)));
    index++;
  }

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: "Trading Fees paid by users.",
    Revenue: "Trading Fees collected by the protocol.",
  },
};

export default adapter;

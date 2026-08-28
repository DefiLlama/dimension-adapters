import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics";

const VAULT_REGISTRY = "0x9732A52eB6BAc678BbC95F6C06Ba70a5b2071379";
const VAULT_REGISTERED_EVENT = "event VaultRegistered(address indexed vault, address indexed baseToken)";
const FEE_COLLECTED_EVENT = "event FeeCollected(address indexed feeAddress, uint256 amount)";

const fetch = async (options: FetchOptions) => {
    const { createBalances, getLogs } = options;

    const dailyFees = createBalances();

    const vaults = await getLogs({
        target: VAULT_REGISTRY,
        eventAbi: VAULT_REGISTERED_EVENT,
        fromBlock: 80743203,
        cacheInCloud: true,
    });

    const feeData = await getLogs({
        targets: vaults.map(i => i.vault),
        eventAbi: FEE_COLLECTED_EVENT
    });

    for (const fee of feeData) {
        dailyFees.addUSDValue(new BigNumber(fee.amount.toString()).div(1e18).toNumber(), METRIC.MINT_REDEEM_FEES);
    };

    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
};

const methodology = {
    Fees: "A one-time 1% fee charged on stUSD minted from each vault.",
    Revenue: "A one-time 1% fee charged on stUSD minted from each vault.",
    ProtocolRevenue: "A one-time 1% fee charged on stUSD minted from each vault.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: "A one-time 1% fee charged on stUSD minted from each vault.",
  },
  Revenue: {
    [METRIC.MINT_REDEEM_FEES]: "A one-time 1% fee charged on stUSD minted from each vault.",
  },
  ProtocolRevenue: {
    [METRIC.MINT_REDEEM_FEES]: "A one-time 1% fee charged on stUSD minted from each vault."
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  pullHourly: true,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2026-02-12',
    },
  },
};

export default adapter;

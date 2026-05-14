import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const VAULT_REGISTRY = "0x9732A52eB6BAc678BbC95F6C06Ba70a5b2071379";
const VAULT_REGISTERED_EVENT = "event VaultRegistered(address indexed vault, address indexed baseToken)";
const FEE_COLLECTED_EVENT = "event FeeCollected(address indexed feeAddress, uint256 amount)";
const STUSD = "0xd83ec2f9c40248fa8546c1001ae07e667c380778";

const fetch = async (options: FetchOptions) => {
    const { createBalances, getLogs } = options;

    const dailyFees = createBalances();

    const vaults = await getLogs({
        target: VAULT_REGISTRY,
        eventAbi: VAULT_REGISTERED_EVENT,
        fromBlock: 80743203,
    });

    const feeData = await getLogs({
        targets: vaults.map(i => i.vault),
        eventAbi: FEE_COLLECTED_EVENT
    });

    for (const fee of feeData) {
        dailyFees.add(STUSD, fee.amount, 'Borrowing Fees');
    };

    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
};

const breakdownMethodology = {
  Fees: {
    "Borrowing Fees": "A one-time 1% fee charged on stUSD minted from each vault.",
  },
  Revenue: {
    "Borrowing Fees": "A one-time 1% fee charged on stUSD minted from each vault.",
  },
  ProtocolRevenue: {
    "Borrowing Fees": "A one-time 1% fee charged on stUSD minted from each vault."
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  breakdownMethodology,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2026-02-12',
    },
  },
};

export default adapter;
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

/**
 * Docs: https://docs.makina.finance/
 *
 * Fee Model:
 * - Fixed fees: Based on AUM + elapsed time (management fees)
 * - Performance fees: Based on strategy gains (profit sharing)
 * - Implementation: Fees minted as new Machine Tokens and distributed to Operator/DAO/Security
 * - Fees take the form of newly minted Machine Tokens, which are distributed to the Operator, Security Module, and Makina DAO. 
 * - Since these tokens increase the overall supply without a corresponding increase in AUM, they dilute the share price, effectively socializing fees across all Machine Token holders. 
 * - Fees are minted and distributed atomically along Machine AUM updates.
 *
 * Methodology:
 * - Track ERC20 Transfer events where `from = 0x0` (mint)
 * - Exclude mints sent to Depositor / PreDepositVault (user deposits)
 * - Remaining mints = protocol fees (dilutionary)
 * - Value fee shares using oracle pricing
 */

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ABI = {
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
  getSharePrice: "function getSharePrice() view returns (uint256)",
};

type MachineConfig = {
  shareToken: string;
  accountingToken: string;
  depositor: string;
  preDepositVault?: string;
  sharePriceOracle: string;
};

const MACHINES: MachineConfig[] = [
  {
    // DUSD
    shareToken: "0x1e33e98af620f1d563fcd3cfd3c75ace841204ef",
    accountingToken: ADDRESSES.ethereum.USDC,
    depositor: "0x94B1828F91c150C5E6776198e170aCa4304903d7",
    preDepositVault: "0x5df4cb0aaae0fcc9de3f41e72348609e30a49c44",
    sharePriceOracle: "0xFFCBc7A7eEF2796C277095C66067aC749f4cA078",
  },
  {
    // DETH
    shareToken: "0x871ab8e36cae9af35c6a3488b049965233deb7ed",
    accountingToken: ADDRESSES.ethereum.WETH,
    depositor: "0x9662d85fdBc68F2218974aabdcdE5e61B59132B0",
    preDepositVault: "0xefc8e0fce12c164eafcb588915c6f0ca7ca41a53",
    sharePriceOracle: "0x49fba73738461835fefB19351b161Bde4BcD6b5A",
  },
  {
    // DBIT
    shareToken: "0x972966bcc17f7d818de4f27dc146ef539c231bdf",
    accountingToken: ADDRESSES.ethereum.WBTC,
    depositor: "0xb0475F38393E98c851F8e0377002fD45E2201E4D",
    preDepositVault: "0x49af2649eefbc7e3847b41100fddcf91134a549e",
    sharePriceOracle: "0x8B04bf6A374C40887F03B1928871c96f006Bb2fc",
  },
];

async function getOraclePrice(
  options: FetchOptions,
  oracle: string
): Promise<{ price: number }> {
  const result = await options.api.call({
    target: oracle,
    abi: ABI.getSharePrice
  });
  const price = Number(result);

  return { price };
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const machine of MACHINES) {
    const logs: any[] = await options.getLogs({
      target: machine.shareToken,
      eventAbi: ABI.Transfer,
      onlyArgs: true,
    });

    const excludedRecipients = new Set<string>([
      machine.depositor.toLowerCase(),
      machine.preDepositVault?.toLowerCase() ?? "",
    ]);

    let feeShares = 0;

    for (const log of logs) {
      const from = (log.from ?? "").toLowerCase();
      const to = (log.to ?? "").toLowerCase();

      if (from !== ZERO_ADDRESS) continue;
      if (!to || excludedRecipients.has(to)) continue;

      const value = Number(log.value);
      if (value > 0n) feeShares += value;
    }

    // Get oracle price
    const oracle = await getOraclePrice(options, machine.sharePriceOracle);

    // Convert fee shares to accounting token amount
    // oracle.price is in 1e18 units per share
    // feeShares is in 10^18 units (18 decimals)
    // feesInAccountingToken = (feeShares / 10^18) * (oracle.price / 1e18)
    const feesInAccountingToken = (feeShares * oracle.price) / 1e18 / 1e18;

    dailyFees.add(machine.accountingToken, feesInAccountingToken);
    dailyRevenue.add(machine.accountingToken, feesInAccountingToken);
    dailyProtocolRevenue.add(
      machine.accountingToken,
      feesInAccountingToken
    );
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2024-11-01",
    },
  },
  methodology: {
    Fees:
      "Fees are calculated from Machine Token mints (ERC20 Transfer from 0x0) that are not minted to the Machine's Depositor or PreDepositVault contracts. Minted shares are valued using the strategy's Share Price Oracle.",
    Revenue:
      "All minted fees are treated as revenue captured by Makina ecosystem recipients (Operator, Security Module, and Makina DAO).",
    ProtocolRevenue:
      "Same as Revenue (all fees accrue to Makina-controlled addresses).",
    SupplySideRevenue:
      "0 (fees are paid via share dilution rather than distributed to depositors).",
  },
};

export default adapter;

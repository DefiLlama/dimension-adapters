import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// LooprBasketFactory (permissionless registry of LooprBasket index tokens),
// deployed 2026-09-03 — the adapter's `start` date must not predate this,
// since basketCount()/baskets() are direct contract calls that fail against
// blocks pinned before the factory existed (unlike getLogs, which just
// returns an empty range for a pre-deployment period).
const FACTORY = "0xf6B7e67816622a1E6dDb898EEB09cA8eb8e3D2B0";
const BASKETS_ABI =
  "function baskets(uint256) view returns (address basket, address creator, bool active)";
const CONSTITUENTS_ABI = "address[]:constituents";
const UNITS_PER_SHARE_ABI = "uint256[]:unitsPerShare";
const MINTED_ABI =
  "event Minted(address indexed sender, address indexed to, uint256 basketAmount, uint256 fee)";

const CREATOR_FEE_SHARE_BPS = 7_000n; // 70% of a basket's mint fee to that basket's own creator
const BPS_DENOM = 10_000n;
const ONE_E18 = 1_000_000_000_000_000_000n;

// LOOPR is Loopr's own token, launched through Pons;
const PONS_HOOK = "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044";
const LOOPR_POOL_ID =
  "0x3658188598546bc4b1c3abf66cee57b23cf917ec820c33a6a511e8bb0d2e90ef";
const POOL_FEES_SWEPT_TOPIC0 =
  "0x2f3c43579b9064b6f28edcf41608f3815792d274a56afe024359703cb4ea9b30";
const POOL_FEES_SWEPT_ABI =
  "event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount, uint256 tokensLocked)";

// LooprCommunityVault — Loopr's own buyback-and-burn contract. Holds ETH from
// sponsorships/partnerships/creator-tax sweeps and burns LOOPR bought against
// the live pool.
const COMMUNITY_VAULT = "0xBE931190dFfC00B937b164A352BFC39140163c8c";
const DEPOSITED_ABI =
  "event Deposited(address indexed from, uint256 amount, string source)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // ---- 1. LooprBasket mint fees (in-kind, fixed-recipe index tokens) ----
  const basketCount = Number(
    await options.api.call({ target: FACTORY, abi: "uint256:basketCount" }),
  );

  if (basketCount > 0) {
    const basketIds = Array.from({ length: basketCount }, (_, i) => i);
    const basketInfos = await options.api.multiCall({
      target: FACTORY,
      abi: BASKETS_ABI,
      calls: basketIds,
    });
    const basketAddresses: string[] = basketInfos.map((b: any) => b.basket);

    const [constituentsPerBasket, unitsPerBasket] = await Promise.all([
      options.api.multiCall({ abi: CONSTITUENTS_ABI, calls: basketAddresses }),
      options.api.multiCall({
        abi: UNITS_PER_SHARE_ABI,
        calls: basketAddresses,
      }),
    ]);

    const constituentsByBasket: Record<string, string[]> = {};
    const unitsByBasket: Record<string, bigint[]> = {};
    basketAddresses.forEach((addr, i) => {
      constituentsByBasket[addr.toLowerCase()] = constituentsPerBasket[i];
      unitsByBasket[addr.toLowerCase()] = unitsPerBasket[i].map((u: any) =>
        BigInt(u),
      );
    });

    const mintLogs = await options.getLogs({
      targets: basketAddresses,
      eventAbi: MINTED_ABI,
      entireLog: true,
      parseLog: true,
    });

    mintLogs.forEach((log: any) => {
      const fee = BigInt(log.args.fee);
      if (fee === 0n) return;

      const basketAddr = log.address.toLowerCase();
      const assets = constituentsByBasket[basketAddr];
      const units = unitsByBasket[basketAddr];

      assets.forEach((asset: string, i: number) => {
        // The mint fee is minted as extra basket shares, backed by the same
        // fixed recipe every other share is: fee shares * unitsPerShare[i].
        const amount = (fee * units[i]) / ONE_E18;
        if (amount === 0n) return;

        const creatorCut = (amount * CREATOR_FEE_SHARE_BPS) / BPS_DENOM;
        const protocolCut = amount - creatorCut;

        dailyFees.add(asset, amount, "Basket Mint Fees");
        dailyRevenue.add(asset, protocolCut, "Basket Mint Fees To Loopr");
        dailyProtocolRevenue.add(
          asset,
          protocolCut,
          "Basket Mint Fees To Loopr",
        );
        dailySupplySideRevenue.add(
          asset,
          creatorCut,
          "Basket Mint Fees To Basket Creators",
        );
      });
    });
  }

  // ---- 2. LOOPR token creator tax ----
  const sweptLogs = await options.getLogs({
    target: PONS_HOOK,
    eventAbi: POOL_FEES_SWEPT_ABI,
    topics: [POOL_FEES_SWEPT_TOPIC0, LOOPR_POOL_ID],
    entireLog: true,
    parseLog: true,
  });

  sweptLogs.forEach((log: any) => {
    const creatorAmount = BigInt(log.args.creatorAmount);
    const protocolAmount = BigInt(log.args.protocolAmount);
    const totalAmount = creatorAmount + protocolAmount;
    if (totalAmount === 0n) return;

    dailyFees.addGasToken(totalAmount, "LOOPR Token Creator Tax");
    dailyRevenue.addGasToken(totalAmount, "LOOPR Token Creator Tax");
    dailyProtocolRevenue.addGasToken(totalAmount, "LOOPR Token Creator Tax");
  });

  // ---- 3. Community vault deposits (sponsorships, partnerships, sweeps) ----
  const depositLogs = await options.getLogs({
    target: COMMUNITY_VAULT,
    eventAbi: DEPOSITED_ABI,
    entireLog: true,
    parseLog: true,
  });

  depositLogs.forEach((log: any) => {
    const amount = BigInt(log.args.amount);
    if (amount === 0n) return;

    dailyFees.addGasToken(amount, "LOOPR Community Vault Deposits");
    dailyRevenue.addGasToken(amount, "LOOPR Community Vault Deposits");
    dailyProtocolRevenue.addGasToken(amount, "LOOPR Community Vault Deposits");
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Loopr basket mint fees (paid in-kind by minters, in the basket's own constituent tokens), the LOOPR-token creator + protocol tax collected via launchpad hook, and ETH deposited into Loopr's community vault.",
  Revenue:
    "Loopr's 30% cut of each basket's mint fee, the LOOPR token creator + protocol tax paid to Loopr's own wallet, and ETH deposited into Loopr's community vault.",
  ProtocolRevenue:
    "Same as Revenue — all legs accrue directly to Loopr, not to a separate treasury/DAO split.",
  SupplySideRevenue:
    "The 70% of each basket's mint fee paid to that specific basket's own (possibly third-party, permissionless) creator.",
};

const breakdownMethodology = {
  Fees: {
    "Basket Mint Fees":
      "Mint fee charged on LooprBasket index-token mints, paid in-kind in the basket's constituent tokens.",
    "LOOPR Token Creator Tax":
      "LOOPR token creator's and protocol's cut of the swap tax on LOOPR/ETH, both paid to Loopr's own wallet.",
    "LOOPR Community Vault Deposits":
      "ETH deposited into Loopr's LooprCommunityVault (sponsorships, partnerships, creator-tax sweeps).",
  },
  Revenue: {
    "Basket Mint Fees To Loopr":
      "Loopr protocol's 30% share of every basket's mint fee.",
    "LOOPR Token Creator Tax":
      "LOOPR token creator's and protocol's cut of the swap tax, both paid to Loopr's own wallet.",
    "LOOPR Community Vault Deposits":
      "ETH deposited into Loopr's LooprCommunityVault (sponsorships, partnerships, creator-tax sweeps).",
  },
  ProtocolRevenue: {
    "Basket Mint Fees To Loopr":
      "Loopr protocol's 30% share of every basket's mint fee.",
    "LOOPR Token Creator Tax":
      "LOOPR token creator's and protocol's cut of the swap tax, both paid to Loopr's own wallet.",
    "LOOPR Community Vault Deposits":
      "ETH deposited into Loopr's LooprCommunityVault (sponsorships, partnerships, creator-tax sweeps).",
  },
  SupplySideRevenue: {
    "Basket Mint Fees To Basket Creators":
      "The 70% of a basket's mint fee paid to that basket's own creator (permissionless — may not be Loopr itself).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-09-03",
    },
  },
};

export default adapter;

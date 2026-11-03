import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Overcall: skill-based markets on Robinhood Chain (Channels, and predictions on other players' channels). Every
// currency has its own vault, the counterparty of every position in it. Each settled position emits the vault's
// Settled event, which splits the money (contracts v3 GameLogic):
// - a win: fromCapital = the gain paid out of the vault's capital; the profit fee = 10% of it (profitFeeBps 1000 on
//   every listed asset); toRevenue = the open fee + the profit fee less the royalty; toRoyalty = 15% of the profit fee
//   to the creator of the channel a prediction was made on (none on the creator's own position);
// - a loss, an early close at or below the stake, a refund: fromCapital = 0 and toRevenue = the open fee.
// Of the profit fees, 25% go to $OVER holders: from $OVER positions to the $OVER stakers' rewards, from USDG
// positions to $OVER buybacks. Contracts: ChannelGame 0x1C7dDdc2fA9BEc0549FcdeabcfeBD37452d2CDCb, one Vault per currency.
const OVER_VAULT = "0xFB4C6062c24313E2E8Cf01D1CCBa0B940e7b29f6";
const USDG_VAULT = "0x526b07940694f599aA2e9DbDE30540BE004aC80e";
const VAULTS = [OVER_VAULT, USDG_VAULT];
// $OVER is priced by its CoinGecko id: the coins server has no price for its Robinhood Chain address yet
const OVER_CG = "overcall";
const PROFIT_FEE_BPS = 1000n;
const HOLDERS_SHARE_BPS = 2500n; // of the profit fee

const SETTLED = "event Settled(uint256 depositIn, uint256 fromCapital, address indexed to, uint256 toPlayer, uint256 toRevenue, uint256 indexed royaltyChannelId, uint256 toRoyalty)";

const L = {
  openFees: "Open Fees",
  profitFees: "Profit Fees",
  openToProtocol: "Open Fees To Protocol",
  profitToProtocol: "Profit Fees To Protocol",
  toStakers: "Profit Fees To $OVER Stakers",
  toBuybacks: "Profit Fees To $OVER Buybacks",
  toCreators: "Profit Fees To Channel Creators",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const tokens: string[] = await options.api.multiCall({ abi: "address:token", calls: VAULTS });
  const logs = await options.getLogs({ targets: VAULTS, eventAbi: SETTLED, flatten: false });
  VAULTS.forEach((vault, i) => {
    const over = vault === OVER_VAULT;
    const add = (balances: any, amount: bigint, label: string) => {
      if (amount <= 0n) return;
      if (over) balances.addCGToken(OVER_CG, Number(amount) / 1e18, label);
      else balances.add(tokens[i], amount, label);
    };
    for (const l of logs[i]) {
      const toRevenue = BigInt(l.toRevenue);
      const toRoyalty = BigInt(l.toRoyalty);
      const profitFee = (BigInt(l.fromCapital) * PROFIT_FEE_BPS) / 10000n;
      const openFee = toRevenue + toRoyalty - profitFee;
      const toHolders = (profitFee * HOLDERS_SHARE_BPS) / 10000n;
      const profitToProtocol = profitFee - toRoyalty - toHolders;
      const holdersLabel = over ? L.toStakers : L.toBuybacks;

      add(dailyFees, openFee, L.openFees);
      add(dailyFees, profitFee, L.profitFees);
      add(dailyRevenue, openFee, L.openToProtocol);
      add(dailyRevenue, profitToProtocol, L.profitToProtocol);
      add(dailyRevenue, toHolders, holdersLabel);
      add(dailyProtocolRevenue, openFee, L.openToProtocol);
      add(dailyProtocolRevenue, profitToProtocol, L.profitToProtocol);
      add(dailyHoldersRevenue, toHolders, holdersLabel);
      add(dailySupplySideRevenue, toRoyalty, L.toCreators);
    }
  });
  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-20",
  methodology: {
    Fees: "The fees players pay on settled positions: the open fee on each deposit and the 10% profit fee on a gain.",
    UserFees: "The open fees and profit fees players pay on settled positions.",
    Revenue: "The fees less the creator royalty: the protocol's share and the $OVER holders' share.",
    ProtocolRevenue: "The open fees and the profit fees less the creator royalty and the $OVER holders' share.",
    HoldersRevenue: "25% of the profit fees: from $OVER positions to the $OVER stakers' rewards, from USDG positions to $OVER buybacks.",
    SupplySideRevenue: "The creator royalty: 15% of the profit fee on a winning prediction, paid to the creator of the channel predicted on.",
  },
  breakdownMethodology: {
    Fees: {
      [L.openFees]: "The open fee on each position's deposit.",
      [L.profitFees]: "10% of the gain of a winning position or a close above the stake.",
    },
    Revenue: {
      [L.openToProtocol]: "The open fees, kept by the protocol.",
      [L.profitToProtocol]: "The profit fees less the creator royalty and the $OVER holders' share.",
      [L.toStakers]: "25% of the profit fees from $OVER positions, to the $OVER stakers' rewards.",
      [L.toBuybacks]: "25% of the profit fees from USDG positions, used to buy back $OVER.",
    },
    ProtocolRevenue: {
      [L.openToProtocol]: "The open fees, kept by the protocol.",
      [L.profitToProtocol]: "The profit fees less the creator royalty and the $OVER holders' share.",
    },
    HoldersRevenue: {
      [L.toStakers]: "25% of the profit fees from $OVER positions, to the $OVER stakers' rewards.",
      [L.toBuybacks]: "25% of the profit fees from USDG positions, used to buy back $OVER.",
    },
    SupplySideRevenue: {
      [L.toCreators]: "15% of the profit fee on a winning prediction, to the creator of the channel predicted on.",
    },
  },
};

export default adapter;

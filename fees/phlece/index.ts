import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

// Phlece (phlece.fun) - USDC bonding-curve launchpad on Arc. Every curve lives inside one
// factory contract; buys/sells settle in USDC against it until a curve raises $69k, then it
// graduates into a permanently locked Uniswap v4 pool. Contracts are Sourcify exact-match
// verified on arc-scan.org.
const FACTORY = "0x955805efaa04cb1d32ee465e3281ab0eebaf8090";
const DEPLOY_BLOCK = 22108124;
const USDC = ADDRESSES.arc.USDC;

// The factory keeps these as internal storage (slots 1, 2 and 4, read directly on-chain) to stay
// under EIP-170, so they have no getters. treasury is the team's 2-of-3 Safe.
const TREASURY = "0xd5fe1a5a8c85fff14c0833c4ff8920d957931440";
const FLYWHEEL = "0x78f5f8898f9ccefa6987b007248064d72523dff4";
const GRADUATION_SEEDER = "0x96d7b08093863421ec8338b95bed0045709fa321";

const LAUNCHED = "event Launched(address indexed token, string ticker, address indexed creator, address vault, address escrow, bool isGenesis)";
const BUY = "event Buy(address indexed token, address indexed buyer, uint256 usdcIn, uint256 tokensOut)";
const SELL = "event Sell(address indexed token, address indexed seller, uint256 tokensIn, uint256 usdcOut, bool paperHands)";
const GRADUATED = "event Graduated(address indexed token, uint256 finalReserve, uint256 graduationFee)";
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TRADING_FEES = "Trading Fees";
const GRADUATION_FEES = "Graduation Fees";
const FEES_TO_TREASURY = "Trading Fees to Protocol Treasury";
const FEES_TO_BUYBACK = "Trading Fees to Launched Token Buyback";
const FEES_TO_HOLDERS = "Trading Fees to Launched Token Holders";
const FEES_TO_CREATORS = METRIC.CREATOR_FEES;
const FEES_TO_REFERRERS = "Trading Fees to Referrers";

const lower = (v: any) => String(v).toLowerCase();

// The trade fee is never emitted as its own number (Sell only reports the seller's net), so it's
// measured where it actually lands: every USDC transfer the factory makes inside a Buy/Sell tx,
// minus the seller's own proceeds and the graduation seed. Whatever reaches a known bucket is
// labelled by it; the rest are the 3-level referral payouts and the optional caller bounty, both
// of which go to the trader's referrer.
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [launches, buys, sells, graduations, transfers] = await Promise.all([
    options.getLogs({ target: FACTORY, eventAbi: LAUNCHED, fromBlock: DEPLOY_BLOCK, cacheInCloud: true }),
    options.getLogs({ target: FACTORY, eventAbi: BUY, entireLog: true, parseLog: true }),
    options.getLogs({ target: FACTORY, eventAbi: SELL, entireLog: true, parseLog: true }),
    options.getLogs({ target: FACTORY, eventAbi: GRADUATED, entireLog: true, parseLog: true }),
    options.getLogs({
      target: USDC,
      eventAbi: TRANSFER,
      topics: [TRANSFER_TOPIC, "0x000000000000000000000000" + FACTORY.slice(2)],
      entireLog: true,
      parseLog: true,
    }),
  ]);

  const vaults = new Set(launches.map((l: any) => lower(l.vault)));
  const escrows = new Set(launches.map((l: any) => lower(l.escrow)));

  const tradersByTx = new Map<string, Set<string>>();
  const addTrader = (tx: string, trader: string) => {
    if (!tradersByTx.has(tx)) tradersByTx.set(tx, new Set());
    tradersByTx.get(tx)!.add(trader);
  };
  buys.forEach((l: any) => addTrader(lower(l.transactionHash), lower(l.args.buyer)));
  sells.forEach((l: any) => addTrader(lower(l.transactionHash), lower(l.args.seller)));

  // Graduation happens inside the buy that crosses the threshold, so its 2% fee to the treasury
  // shares a tx with that buy's own trade-fee transfers; matched by exact amount to separate them.
  const graduationFeesByTx = new Map<string, bigint[]>();
  graduations.forEach((l: any) => {
    const tx = lower(l.transactionHash);
    if (!graduationFeesByTx.has(tx)) graduationFeesByTx.set(tx, []);
    graduationFeesByTx.get(tx)!.push(BigInt(l.args.graduationFee));
  });

  for (const log of transfers) {
    const tx = lower(log.transactionHash);
    const traders = tradersByTx.get(tx);
    if (!traders) continue; // not a trade (e.g. owner-only rescue after a failed graduation)

    const to = lower(log.args.to);
    const amount = BigInt(log.args.value);
    if (amount === 0n || to === GRADUATION_SEEDER || traders.has(to)) continue;

    if (to === TREASURY) {
      const pending = graduationFeesByTx.get(tx);
      const idx = pending ? pending.indexOf(amount) : -1;
      if (idx !== -1) {
        pending!.splice(idx, 1);
        dailyFees.add(USDC, amount, GRADUATION_FEES);
        dailyRevenue.add(USDC, amount, GRADUATION_FEES);
        dailyProtocolRevenue.add(USDC, amount, GRADUATION_FEES);
        continue;
      }
      dailyFees.add(USDC, amount, TRADING_FEES);
      dailyRevenue.add(USDC, amount, FEES_TO_TREASURY);
      dailyProtocolRevenue.add(USDC, amount, FEES_TO_TREASURY);
    } else if (to === FLYWHEEL) {
      // PhleceFlywheel buys back and burns the launched token itself, not a protocol token.
      dailyFees.add(USDC, amount, TRADING_FEES);
      dailySupplySideRevenue.add(USDC, amount, FEES_TO_BUYBACK);
    } else if (vaults.has(to)) {
      dailyFees.add(USDC, amount, TRADING_FEES);
      dailySupplySideRevenue.add(USDC, amount, FEES_TO_HOLDERS);
    } else if (escrows.has(to)) {
      dailyFees.add(USDC, amount, TRADING_FEES);
      dailySupplySideRevenue.add(USDC, amount, FEES_TO_CREATORS);
    } else {
      dailyFees.add(USDC, amount, TRADING_FEES);
      dailySupplySideRevenue.add(USDC, amount, FEES_TO_REFERRERS);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "USDC trading fees charged on bonding-curve buys and sells (sells default to 1.5%, buys to 0%; creators can set 1-10%), plus the one-time 2% graduation fee taken from a curve's reserve when it migrates to Uniswap v4.",
  Revenue: "The share of trading fees paid to the protocol treasury (a fixed 5.63% of every fee plus the per-token treasury allocation) and graduation fees.",
  ProtocolRevenue: "Same as Revenue: everything paid to the protocol treasury.",
  SupplySideRevenue: "Trading fees paid to launched-token creators (via escrow), launched-token holders (USDC dividend vault), the launched-token buyback-and-burn flywheel, and referrers.",
};

const breakdownMethodology = {
  Fees: {
    [TRADING_FEES]: "USDC fees charged on bonding-curve buys and sells.",
    [GRADUATION_FEES]: "2% of a curve's USDC reserve, taken once when it graduates to Uniswap v4.",
  },
  Revenue: {
    [FEES_TO_TREASURY]: "Trading fees paid to the protocol treasury.",
    [GRADUATION_FEES]: "Graduation fees paid to the protocol treasury.",
  },
  ProtocolRevenue: {
    [FEES_TO_TREASURY]: "Trading fees paid to the protocol treasury.",
    [GRADUATION_FEES]: "Graduation fees paid to the protocol treasury.",
  },
  SupplySideRevenue: {
    [FEES_TO_CREATORS]: "Trading fees paid into the token creator's escrow.",
    [FEES_TO_HOLDERS]: "Trading fees paid into the launched token's USDC dividend vault for its holders.",
    [FEES_TO_BUYBACK]: "Trading fees sent to the flywheel, which buys back and burns the launched token.",
    [FEES_TO_REFERRERS]: "Trading fees paid to the trader's referrers (3-level referral program and caller bounty).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-22",
  methodology,
  breakdownMethodology,
};

export default adapter;

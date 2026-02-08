import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SNATCH = '0x1Ef75dc4904b71021F308a8D276be346889fEe62';
const MINES = '0x8536f84d0300Be2B6733B69Bcd48613a9E04E918';
const GLORB = '0xa26303226Baa2299adA8D573a6FcD792aB1CFB07';

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  // --- Snatch V4 ---
  // Each buy: 10% is fees (5% buyback-burn + 3% dividends + 2% jackpot)
  const snatchBuys = await getLogs({
    target: SNATCH,
    eventAbi: 'event ShinyBought(address indexed buyer, uint256 count, uint256 cost, uint256 round)',
  });
  for (const e of snatchBuys) {
    dailyFees.addGasToken(e.cost / 10n);        // 10% total fees
    dailyRevenue.addGasToken(e.cost / 20n);      // 5% buyback-burn = protocol revenue
  }

  // --- Mines: ETH fees ---
  const registrations = await getLogs({
    target: MINES,
    eventAbi: 'event PlayerRegistered(address indexed player, address indexed referrer, uint256 ethPaid)',
  });
  for (const e of registrations) {
    dailyFees.addGasToken(e.ethPaid);
  }

  const depthUnlocks = await getLogs({
    target: MINES,
    eventAbi: 'event DepthUnlocked(address indexed player, uint8 newDepth, uint256 ethPaid)',
  });
  for (const e of depthUnlocks) {
    dailyFees.addGasToken(e.ethPaid);
  }

  const prestiges = await getLogs({
    target: MINES,
    eventAbi: 'event Prestiged(address indexed player, uint8 newPrestigeLevel, uint256 ethPaid)',
  });
  for (const e of prestiges) {
    dailyFees.addGasToken(e.ethPaid);
  }

  // --- Mines: GLORB fees from stat upgrades ---
  // 10% burned (deflationary revenue), 85% recycled, 5% jackpot
  const upgrades = await getLogs({
    target: MINES,
    eventAbi: 'event StatUpgraded(address indexed player, uint8 statType, uint16 newLevel, uint256 glorbCost)',
  });
  for (const e of upgrades) {
    dailyFees.add(GLORB, e.glorbCost);
    dailyRevenue.add(GLORB, e.glorbCost / 10n);  // 10% burn = protocol revenue
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-02-01',
    },
  },
  methodology: {
    Fees: 'Total fees: Snatch (10% of buys: buyback + dividends + jackpot) + Mines (all ETH from registration, depth unlocks, prestige + all GLORB from stat upgrades).',
    Revenue: 'Protocol revenue via deflation: Snatch buyback-and-burn (5% of buys) + Mines GLORB burn (10% of stat upgrade costs).',
    ProtocolRevenue: 'Same as Revenue — all protocol revenue flows through buyback/burn mechanisms.',
  },
};

export default adapter;

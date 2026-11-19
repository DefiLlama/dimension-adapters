import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Toros Perpetual Options run on a Flat Money v2 deployment on Arbitrum (WBTC collateral).
// Vault: 0x29fAD9d44C550e5D8081AB35763797B39d75b858 (FlatcoinVault), collateral() = WBTC (8 decimals).
// Positions are ERC-721s minted by the vault's leverageModule; the controllerModule is an
// OptionsControllerModule whose profitLoss = max(0, price - averagePrice) * size / price,
// i.e. every position is a perpetual call on WBTC struck at its entry price.
// Buyers (the Toros Protected Leveraged Token vaults) pay `tradeFee` on open/adjust/close,
// which the OrderExecutionModule collects and splits between the Covered Call LP and the
// protocol fee recipient. Trade sizes and fees are denominated in WBTC (1e8), prices in USD (1e18).
const LEVERAGE_MODULE = "0xb1353d51991e79fefd4bfdba2a03e9f0232814a6"; // vault.moduleAddress("leverageModule")
const WBTC = ADDRESSES.arbitrum.WBTC; // vault.collateral()

const LEVERAGE_OPEN = "event LeverageOpen(address account, uint256 tokenId, uint256 entryPrice, uint256 margin, uint256 size, uint256 tradeFee)";
const LEVERAGE_ADJUST = "event LeverageAdjust(uint256 tokenId, uint256 averagePrice, uint256 adjustPrice, int256 marginDelta, int256 sizeDelta, uint256 tradeFee)";
const LEVERAGE_CLOSE = "event LeverageClose(uint256 tokenId, uint256 closePrice, (int256 profitLoss, int256 accruedFunding, int256 marginAfterSettlement) positionSummary, uint256 settledMargin, uint256 size, uint256 tradeFee)";

const SIZE_DECIMALS = 1e8; // WBTC
const PRICE_DECIMALS = 1e18; // OracleModule.getPrice() USD price

async function fetch(options: FetchOptions) {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  const [opens, adjusts, closes] = await Promise.all([
    options.getLogs({ target: LEVERAGE_MODULE, eventAbi: LEVERAGE_OPEN }),
    options.getLogs({ target: LEVERAGE_MODULE, eventAbi: LEVERAGE_ADJUST }),
    options.getLogs({ target: LEVERAGE_MODULE, eventAbi: LEVERAGE_CLOSE }),
  ]);

  const trades = [
    ...opens.map((log: any) => ({ size: log.size, price: log.entryPrice, tradeFee: log.tradeFee })),
    ...adjusts.map((log: any) => ({ size: log.sizeDelta, price: log.adjustPrice, tradeFee: log.tradeFee })),
    ...closes.map((log: any) => ({ size: log.size, price: log.closePrice, tradeFee: log.tradeFee })),
  ];

  for (const trade of trades) {
    // Notional = underlying WBTC traded at the oracle price the order executed at.
    const sizeBtc = Math.abs(Number(trade.size)) / SIZE_DECIMALS;
    const price = Number(trade.price) / PRICE_DECIMALS;
    dailyNotionalVolume.addUSDValue(sizeBtc * price, "Options notional");
    // Premium = the trade fee charged on the size opened/adjusted/closed, paid in WBTC.
    dailyPremiumVolume.add(WBTC, trade.tradeFee, "Options premiums");
  }

  return { dailyNotionalVolume, dailyPremiumVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.ARBITRUM],
  fetch,
  start: '2025-06-15',
  pullHourly: true,
  methodology: {
    NotionalVolume:
      "Underlying WBTC size of every perpetual option position opened, adjusted (absolute size change) or closed on the Toros Perpetual Options market, multiplied by the oracle price recorded in the on-chain LeverageOpen/LeverageAdjust/LeverageClose event.",
    PremiumVolume:
      "Trade fees paid in WBTC by option buyers on each open, adjust and close, as recorded in the same events. Ongoing funding paid by open positions is not included.",
  },
  breakdownMethodology: {
    NotionalVolume: {
      "Options notional": "Absolute WBTC size traded times the execution oracle price.",
    },
    PremiumVolume: {
      "Options premiums": "Trade fee charged on each position open, adjust and close.",
    },
  },
};

export default adapter;

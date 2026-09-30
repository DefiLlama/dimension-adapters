import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const R13_BOOK = "0x039bD7Bb12Ff5854DA226F738FAD372C508A0b2F";

const config: Record<string, { books: string[]; start: string }> = {
  [CHAIN.BASE]: {
    books: [
      "0xd58b814C7Ce700f251722b5555e25aE0fa8169A1",
      "0x1bDff855d6811728acaDC00989e79143a2bdfDed",
      R13_BOOK,
    ],
    start: "2025-10-09",
  },
  [CHAIN.ETHEREUM]: { books: [R13_BOOK], start: "2026-08-19" },
  [CHAIN.ROBINHOOD]: { books: [R13_BOOK], start: "2026-09-23" },
};

const ORDER_FILLED =
  "event OrderFilled(uint256 indexed nonce, address indexed buyer, address indexed seller, address optionAddress, uint256 premiumAmount, uint256 feeCollected, address referrer, uint256 referralFeePaid, bool sellerWasMaker)";
const GET_STRIKES = "function getStrikes() view returns (uint256[])";

const fetch = async (options: FetchOptions) => {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  const fills = await options.getLogs({ targets: config[options.chain].books, eventAbi: ORDER_FILLED });
  if (!fills.length) return { dailyNotionalVolume, dailyPremiumVolume };

  const calls = fills.map((fill: any) => fill.optionAddress);
  const [tokens, contracts, collateral, strikes] = await Promise.all([
    options.api.multiCall({ abi: "address:collateralToken", calls }),
    options.api.multiCall({ abi: "uint256:numContracts", calls }),
    options.api.multiCall({ abi: "uint256:collateralAmount", calls }),
    options.api.multiCall({ abi: GET_STRIKES, calls }),
  ]);
  const decimals = await options.api.multiCall({ abi: "erc20:decimals", calls: tokens });

  fills.forEach((fill: any, i: number) => {
    dailyPremiumVolume.add(tokens[i], fill.premiumAmount);
    if (!strikes[i].length) throw new Error(`no strikes for option ${calls[i]}`);
    if (strikes[i].length === 1) {
      const usd = Number(BigInt(contracts[i]) * BigInt(strikes[i][0])) / 1e8 / 10 ** Number(decimals[i]);
      dailyNotionalVolume.addUSDValue(usd);
    } else {
      dailyNotionalVolume.add(tokens[i], collateral[i]);
    }
  });

  return { dailyNotionalVolume, dailyPremiumVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: config,
  fetch,
  methodology: {
    NotionalVolume:
      "Underlying value of options bought and sold through the Thetanuts OptionBook, counted as contracts times strike for single-strike options and as collateral for spreads, butterflies and condors; excludes RFQ and loan trades.",
    PremiumVolume: "Premium paid by option buyers on Thetanuts OptionBook fills, excluding RFQ and loan trades.",
  },
};

export default adapter;

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const OPTION_BOOKS = [
  "0xd58b814C7Ce700f251722b5555e25aE0fa8169A1", // deployed 2025-10-09, https://basescan.org/tx/0xb1c0ab82583cd7384f90e227253fa4c7d42297a3124f3d25c7fec6fe469dc9cc
  "0x1bDff855d6811728acaDC00989e79143a2bdfDed", // deployed 2026-05-05, https://basescan.org/tx/0xcb442a5237fdb2273ab2ff79d209563526bf935b0cf584eb160e3d2d2117444b
  "0x039bD7Bb12Ff5854DA226F738FAD372C508A0b2F", // deployed 2026-08-19, https://basescan.org/tx/0x96339a0702887c7b1532b31360e17609421b0a08a49246b247f10b602a0014e7
];
// referrer address that odette.fi passes on its fills
const ODETTE_REFERRER = "0x94d784e81a5c8ca6e19629c73217b61a256ea1c7";

const ORDER_FILLED =
  "event OrderFilled(uint256 indexed nonce, address indexed buyer, address indexed seller, address optionAddress, uint256 premiumAmount, uint256 feeCollected, address referrer, uint256 referralFeePaid, bool sellerWasMaker)";
const OPTION_INITIALIZED =
  "event OptionInitialized(address indexed buyer, address indexed seller, address indexed createdBy, uint256 optionType, address collateralToken, address priceFeed, uint256[] strikes, uint256 expiryTimestamp, uint256 numContracts, uint256 collateralAmount, bytes extraOptionData)";
const GET_STRIKES = "function getStrikes() view returns (uint256[])";

type OptionInfo = { token: string; contracts: bigint; strikes: bigint[] };

const fetch = async (options: FetchOptions) => {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  const logs = await options.getLogs({ targets: OPTION_BOOKS, eventAbi: ORDER_FILLED });
  const fills = logs.filter((fill: any) => fill.referrer.toLowerCase() === ODETTE_REFERRER);
  if (!fills.length) return { dailyNotionalVolume, dailyPremiumVolume };

  const optionAddresses = [...new Set(fills.map((fill: any) => fill.optionAddress.toLowerCase()))] as string[];
  const info = new Map<string, OptionInfo>();
  const inits = await options.getLogs({ targets: optionAddresses, eventAbi: OPTION_INITIALIZED, entireLog: true });
  for (const log of inits) {
    info.set(log.address.toLowerCase(), { token: log.args.collateralToken, contracts: BigInt(log.args.numContracts), strikes: log.args.strikes.map((x: any) => BigInt(x)) });
  }
  const missing = optionAddresses.filter((a) => !info.has(a));
  if (missing.length) {
    const [tokens, contracts, strikes] = await Promise.all([
      options.api.multiCall({ abi: "address:collateralToken", calls: missing }),
      options.api.multiCall({ abi: "uint256:numContracts", calls: missing }),
      options.api.multiCall({ abi: GET_STRIKES, calls: missing }),
    ]);
    missing.forEach((a, i) => {
      if (/^0x0{40}$/i.test(tokens[i]) || !strikes[i].length) throw new Error(`no option data for ${a}`);
      info.set(a, { token: tokens[i], contracts: BigInt(contracts[i]), strikes: strikes[i].map((x: any) => BigInt(x)) });
    });
  }

  const tokens = [...new Set([...info.values()].map((o) => o.token.toLowerCase()))];
  const decimalsList = await options.api.multiCall({ abi: "erc20:decimals", calls: tokens });
  const decimals = new Map(tokens.map((t, i) => [t, Number(decimalsList[i])]));

  for (const fill of fills) {
    const o = info.get(fill.optionAddress.toLowerCase())!;
    dailyPremiumVolume.add(o.token, fill.premiumAmount);
    const avgStrike = o.strikes.reduce((a, b) => a + b, 0n) / BigInt(o.strikes.length);
    dailyNotionalVolume.addUSDValue(Number(o.contracts * avgStrike) / 1e8 / 10 ** decimals.get(o.token.toLowerCase())!); // strikes use 8 decimals
  }

  return { dailyNotionalVolume, dailyPremiumVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  start: "2025-10-09",
  fetch,
  methodology: {
    NotionalVolume:
      "Underlying value of options bought and sold through Odette on Base, identified by the Odette referrer address on the OptionBook contracts, counted as contracts times strike, using the mean strike for spreads, butterflies and condors, counted once per fill, not per leg.",
    PremiumVolume: "Premium paid by option buyers on OptionBook fills referred by Odette.",
  },
};

export default adapter;

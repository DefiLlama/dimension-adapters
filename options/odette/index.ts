import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const OPTION_BOOKS = [
  "0xd58b814C7Ce700f251722b5555e25aE0fa8169A1",
  "0x1bDff855d6811728acaDC00989e79143a2bdfDed",
  "0x039bD7Bb12Ff5854DA226F738FAD372C508A0b2F",
];
const ODETTE_REFERRER = "0x94d784e81a5c8ca6e19629c73217b61a256ea1c7";

const ORDER_FILLED =
  "event OrderFilled(uint256 indexed nonce, address indexed buyer, address indexed seller, address optionAddress, uint256 premiumAmount, uint256 feeCollected, address referrer, uint256 referralFeePaid, bool sellerWasMaker)";
const OPTION_INITIALIZED =
  "event OptionInitialized(address indexed buyer, address indexed seller, address indexed createdBy, uint256 optionType, address collateralToken, address priceFeed, uint256[] strikes, uint256 expiryTimestamp, uint256 numContracts, uint256 collateralAmount, bytes extraOptionData)";
const GET_STRIKES = "function getStrikes() view returns (uint256[])";

type OptionInfo = { token: string; contracts: bigint; collateral: bigint; strikes: bigint[] };

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
    info.set(log.address.toLowerCase(), { token: log.args.collateralToken, contracts: BigInt(log.args.numContracts), collateral: BigInt(log.args.collateralAmount), strikes: log.args.strikes.map((x: any) => BigInt(x)) });
  }
  const missing = optionAddresses.filter((a) => !info.has(a));
  if (missing.length) {
    const [tokens, contracts, collateral, strikes] = await Promise.all([
      options.api.multiCall({ abi: "address:collateralToken", calls: missing }),
      options.api.multiCall({ abi: "uint256:numContracts", calls: missing }),
      options.api.multiCall({ abi: "uint256:collateralAmount", calls: missing }),
      options.api.multiCall({ abi: GET_STRIKES, calls: missing }),
    ]);
    missing.forEach((a, i) => {
      if (/^0x0{40}$/i.test(tokens[i]) || !strikes[i].length) throw new Error(`no option data for ${a}`);
      info.set(a, { token: tokens[i], contracts: BigInt(contracts[i]), collateral: BigInt(collateral[i]), strikes: strikes[i].map((x: any) => BigInt(x)) });
    });
  }

  const tokens = [...new Set([...info.values()].map((o) => o.token.toLowerCase()))];
  const decimalsList = await options.api.multiCall({ abi: "erc20:decimals", calls: tokens });
  const decimals = new Map(tokens.map((t, i) => [t, Number(decimalsList[i])]));

  for (const fill of fills) {
    const o = info.get(fill.optionAddress.toLowerCase())!;
    dailyPremiumVolume.add(o.token, fill.premiumAmount);
    if (o.strikes.length === 1) {
      dailyNotionalVolume.addUSDValue(Number(o.contracts * o.strikes[0]) / 1e8 / 10 ** decimals.get(o.token.toLowerCase())!);
    } else {
      dailyNotionalVolume.add(o.token, o.collateral);
    }
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
      "Underlying value of options bought and sold through Odette on Base, identified by the Odette referrer address on the OptionBook contracts, counted as contracts times strike for single-strike options and as collateral for spreads, butterflies and condors.",
    PremiumVolume: "Premium paid by option buyers on OptionBook fills referred by Odette.",
  },
};

export default adapter;

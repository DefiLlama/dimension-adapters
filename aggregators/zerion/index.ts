import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// https://developers.zerion.io/supported-blockchains
// https://github.com/zeriontech/defi-sdk/blob/router/contracts/router/Router.sol
// https://github.com/zeriontech/defi-sdk/blob/router/contracts/interfaces/IRouter.sol
// https://optimistic.etherscan.io/address/0xd7F1Dd5D49206349CaE8b585fcB0Ce3D96f1696F
const ROUTER = "0xd7F1Dd5D49206349CaE8b585fcB0Ce3D96f1696F";

const eventAbi = "event Executed(address indexed inputToken, uint256 absoluteInputAmount, uint256 inputBalanceChange, address indexed outputToken, uint256 absoluteOutputAmount, uint256 returnedAmount, uint256 protocolFeeAmount, uint256 marketplaceFeeAmount, tuple(uint8 swapType, tuple(uint256 share, address beneficiary) protocolFee, tuple(uint256 share, address beneficiary) marketplaceFee, address account, address caller, bytes callerCallData) swapDescription, address sender)";

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyVolume = createBalances();

  const logs = await getLogs({ target: ROUTER, eventAbi });
  logs.forEach((log: any) => {
    dailyVolume.add(log.inputToken, log.absoluteInputAmount);
  });

  return { dailyVolume };
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2022-03-10" },
    [CHAIN.OPTIMISM]: { fetch, start: "2022-03-10" },
    [CHAIN.ARBITRUM]: { fetch, start: "2022-03-10" },
    [CHAIN.BASE]: { fetch, start: "2023-08-11" },
    [CHAIN.POLYGON]: { fetch, start: "2022-03-10" },
    [CHAIN.BSC]: { fetch, start: "2022-03-10" },
    [CHAIN.AVAX]: { fetch, start: "2022-04-01" },
    [CHAIN.FANTOM]: { fetch, start: "2022-03-10" },
    [CHAIN.LINEA]: { fetch, start: "2023-07-12" },
    [CHAIN.MANTLE]: { fetch, start: "2023-07-15" },
    [CHAIN.BLAST]: { fetch, start: "2024-03-01" },
    [CHAIN.CELO]: { fetch, start: "2022-03-10" },
    [CHAIN.ERA]: { fetch, start: "2023-03-24" },
    [CHAIN.AURORA]: { fetch, start: "2022-03-10" },
    [CHAIN.ABSTRACT]: { fetch, start: "2025-01-01" },
    [CHAIN.APECHAIN]: { fetch, start: "2024-10-01" },
    [CHAIN.BERACHAIN]: { fetch, start: "2025-02-01" },
    [CHAIN.GRAVITY]: { fetch, start: "2024-07-01" },
    [CHAIN.INK]: { fetch, start: "2025-01-01" },
    [CHAIN.KATANA]: { fetch, start: "2025-01-01" },
    [CHAIN.LENS]: { fetch, start: "2025-01-01" },
    [CHAIN.MEGAETH]: { fetch, start: "2025-03-01" },
    [CHAIN.MONAD]: { fetch, start: "2025-03-01" },
    [CHAIN.PLASMA]: { fetch, start: "2025-01-01" },
    [CHAIN.POLYGON_ZKEVM]: { fetch, start: "2023-03-24" },
    [CHAIN.SCROLL]: { fetch, start: "2023-10-01" },
    [CHAIN.SOMNIA]: { fetch, start: "2025-03-01" },
    [CHAIN.SONEIUM]: { fetch, start: "2025-01-01" },
    [CHAIN.SONIC]: { fetch, start: "2024-12-01" },
    [CHAIN.UNICHAIN]: { fetch, start: "2025-02-01" },
    [CHAIN.WC]: { fetch, start: "2024-10-01" },
    [CHAIN.XDC]: { fetch, start: "2024-01-01" },
    [CHAIN.XDAI]: { fetch, start: "2022-03-10" },
    [CHAIN.ZERO]: { fetch, start: "2024-08-01" },
    [CHAIN.ZORA]: { fetch, start: "2023-06-01" },
    [CHAIN.OG]: { fetch, start: "2025-01-01" },
    [CHAIN.HYPERLIQUID]: { fetch, start: "2025-01-01" },
  },
};

export default adapter;

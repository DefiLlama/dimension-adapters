import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type IContract = {
    [c: string | Chain]: {
        id: string;
        startTime: string;
    }
}

const contract: IContract = {
    [CHAIN.ABSTRACT]: {
        id: '0xde6A2171959d7b82aAD8e8B14cc84684C3a186AC',
        startTime: '2025-01-15'
    },
    [CHAIN.APECHAIN]: {
        id: '0xEe80aaE1e39b1d25b9FC99c8edF02bCd81f9eA30',
        startTime: '2025-01-20'
    },
    [CHAIN.ARBITRUM]: {
        id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
        startTime: '2023-08-21'
    },
    [CHAIN.AURORA]: {
        id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
        startTime: '2022-10-21'
    },
    [CHAIN.AVAX]: {
        id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
        startTime: '2022-10-18'
    },
    [CHAIN.BASE]: {
        id: '0x0A6d96E7f4D7b96CFE42185DF61E64d255c12DFf',
        startTime: '2023-08-15'
    },
    [CHAIN.BERACHAIN]: {
        id: '0x070EC43b4222E0f17EEcD2C839cb9D1D5adeF73c',
        startTime: '2025-02-12'
    },
    // [CHAIN.BITCOIN]: {
    //     id: '20000000000001',
    //     startTime: '2023-03-11'
    // },
    [CHAIN.BLAST]: {
        id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
        startTime: '2024-05-17'
    },
    [CHAIN.BOBA]: {
        id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
        startTime: '2022-10-21'
    },
    [CHAIN.BSC]: {
        id: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
        startTime: '2023-07-21'
    },
    [CHAIN.CELO]: {
        id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
        startTime: '2022-10-18'
    },
    [CHAIN.CRONOS]: {
        id: '0x11d40Dc8Ff0CE92F54A315aD8e674a55a866cBEe',
        startTime: '2023-10-19'
    },
    [CHAIN.EVMOS]: {
        id: '0xB49EaD76FE09967D7CA0dbCeF3C3A06eb3Aa0cB4',
        startTime: '2022-10-24'
    },
    [CHAIN.ERA]: {
        id: '0x8dBf6f59187b2EB36B980F3D8F4cFC6DC4E4642e',
        startTime: '2023-07-13'
    },
    [CHAIN.ETHEREUM]: {
        id: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
        startTime: '2023-07-27'
    },
    [CHAIN.FANTOM]: {
        id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
        startTime: '2022-10-18'
    },
    [CHAIN.FRAXTAL]: {
        id: '0x7956280Ec4B4d651C4083Ca737a1fa808b5319D8',
        startTime: '2024-06-27'
    },
    [CHAIN.FUSE]: {
        id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
        startTime: '2023-10-19'
    },
    [CHAIN.GRAVITY]: {
        id: '0x79540403cdE176Ca5f1fb95bE84A7ec91fFDEF76',
        startTime: '2024-07-30'
    },
    [CHAIN.INK]: {
        id: '0x8295805320853d6B28778fC8f5199327e62e3d87',
        startTime: '2025-01-22'
    },
    [CHAIN.LINEA]: {
        id: '0xA4A24BdD4608D7dFC496950850f9763B674F0DB2',
        startTime: '2023-08-28'
    },
    [CHAIN.LISK]: {
        id: '0x50D5a8aCFAe13Dceb217E9a071F6c6Bd5bDB4155',
        startTime: '2024-12-09'
    },
    [CHAIN.MANTLE]: {
        id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
        startTime: '2024-05-13'
    },
    [CHAIN.METIS]: {
        id: '0x27f0e36dE6B1BA8232f6c2e87E00A50731048C6B',
        startTime: '2024-02-03'
    },
    [CHAIN.MODE]: {
        id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
        startTime: '2024-04-15'
    },
    [CHAIN.MOONBEAM]: {
        id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
        startTime: '2022-10-18'
    },
    [CHAIN.MOONRIVER]: {
        id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
        startTime: '2023-10-18'
    },
    [CHAIN.OP_BNB]: {
        id: '0x6A2420650139854F17964b8C3Bb60248470aB57E',
        startTime: '2023-10-24'
    },
    [CHAIN.OPTIMISM]: {
        id: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
        startTime: '2023-07-25'
    },
    [CHAIN.POLYGON]: {
        id: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
        startTime: '2023-07-20'
    },
    [CHAIN.POLYGON_ZKEVM]: {
        id: '0xB49EaD76FE09967D7CA0dbCeF3C3A06eb3Aa0cB4',
        startTime: '2023-06-01'
    },
    [CHAIN.ROOTSTOCK]: {
        id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
        startTime: '2024-05-27'
    },
    [CHAIN.SCROLL]: {
        id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
        startTime: '2024-02-06'
    },
    [CHAIN.SEI]: {
        id: '0x7956280Ec4B4d651C4083Ca737a1fa808b5319D8',
        startTime: '2024-05-27'
    },
    // [CHAIN.SOLANA]: {
    //     id: '1151111081099710',
    //     startTime: '2024-01-01'
    // },
    [CHAIN.SONEIUM]: {
        id: '0x8295805320853d6B28778fC8f5199327e62e3d87',
        startTime: '2025-02-17'
    },
    [CHAIN.SONIC]: {
        id: '0xaFb8cC8fCd71cd768Ce117C11eB723119FCDb1f8',
        startTime: '2025-01-22'
    },
    [CHAIN.SUPERPOSITION]: {
        id: '0x15b9Cf781B4A79C00E4dB7b49d8Bf67359a87Fd2',
        startTime: '2025-04-24'
    },
    [CHAIN.SWELLCHAIN]: {
        id: '0x5d9C68B76809B33317d869FF6034929F4458913c',
        startTime: '2025-04-23'
    },
    [CHAIN.TAIKO]: {
        id: '0xDd8A081efC90DFFD79940948a1528C51793C4B03',
        startTime: '2024-08-15'
    },
    [CHAIN.UNICHAIN]: {
        id: '0x8295805320853d6B28778fC8f5199327e62e3d87',
        startTime: '2025-02-12'
    },
    [CHAIN.VELAS]: {
        id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
        startTime: '2022-10-20'
    },
    [CHAIN.XDAI]: {
        id: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
        startTime: '2023-07-24'
    }
}

const FeeCollectedEvent = "event FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)"

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const data: any[] = await options.getLogs({
        target: contract[options.chain].id,
        topic: '0x28a87b6059180e46de5fb9ab35eb043e8fe00ab45afcc7789e3934ecbbcde3ea',
        eventAbi: FeeCollectedEvent,
    });
    // 0x0000000000000000000000000000000000000000 is the gas token for all chains, we already handle it in the Balances
    data.forEach((log: any) => {
        dailyFees.add(log._token, log._integratorFee);
    });

    return { dailyFees, dailyRevenue: dailyFees } as any;
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: Object.keys(contract).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: contract[chain].startTime
            }
        }
    }, {})
};

export default adapter;

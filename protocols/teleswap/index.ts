import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
const { getTimestamp } = require("@defillama/sdk/build/util");

// TeleBTC addresses
const teleBtc = {
    polygon: "0x3BF668Fe1ec79a84cA8481CEAD5dbb30d61cC685",
    bsc: "0xC58C1117DA964aEbe91fEF88f6f5703e79bdA574",
    bsquared: "0x05698eaD40cD0941e6E5B04cDbd56CB470Db762A",
    bob: "0x0670bEeDC28E9bF0748cB254ABd946c87f033D9d",
};

// Dog address
const dog = {
    polygon: "0x6e031a95e251e0015eb99a330dc1d9933995cc33",
};

// Ordi address
const ordi = {
    bsc: "0x31cb552b371ffC38A67d0534Cb2eDDe3CaB42747",
};

// Mint and burn events
const mintAbi =
    "event Mint(address indexed doer, address indexed receiver, uint value)";
const burnAbi =
    "event Burn(address indexed doer, address indexed burner, uint value)";

const dollarValue = async (
    blockNumber: Number,
    tokenAmount: BigInt,
    tokenDecimals: number,
    chain: CHAIN,
    tokenName: string
) => {
    const logTimestamp = await getTimestamp(blockNumber, chain);

    // Fetch token price
    const priceData = await getPrices([`coingecko:${tokenName}`], logTimestamp);
    const price = priceData[`coingecko:${tokenName}`]?.price || 0;

    // Calculate USD value
    return (Number(tokenAmount) * price) / 10 ** tokenDecimals;
};

const processLog = async (
    logs: any,
    dailyVolume: any,
    tokenName: string,
    tokenAddress: string,
    tokenDecimals: number,
    chain: string,
    startOfDay: number
) => {
    console.log(`Processing ${logs.length} logs for ${tokenName} on ${chain}`);
    let _dailyVolume = BigInt(0);

    for (const log of logs) {
        // Ensure the log value is valid and convert to BigInt
        const tokenAmount = BigInt(log.data || 0);

        // Update daily volume
        _dailyVolume = _dailyVolume + tokenAmount;
    }

    if (logs.length > 0) {
        // Update daily volume
        dailyVolume.addToken(tokenAddress, _dailyVolume);

        // Update daily volume in USD
		// Note: we use price of token at start of day
        const priceData = await getPrices(
            [`coingecko:${tokenName}`],
            startOfDay
        );
        const price = priceData[`coingecko:${tokenName}`]?.price || 0;
        const valueInUSD = (Number(_dailyVolume) * price) / 10 ** tokenDecimals;
        dailyVolume.addUSDValue(valueInUSD);
    }
};

const fetch = async (
    timestamp: number,
    _: ChainBlocks,
    { createBalances, getLogs, chain, startOfDay }: FetchOptions
) => {
    const dailyVolume = createBalances();

    if (dog[chain] != undefined) {
        const mintDogLogs = await getLogs({
            target: dog[chain],
            eventAbi: mintAbi,
            entireLog: true,
        });

        const burnDogLogs = await getLogs({
            target: dog[chain],
            eventAbi: burnAbi,
            entireLog: true,
        });

        // ***************** Process logs *****************
        await processLog(
            mintDogLogs,
            dailyVolume,
            "dog-go-to-the-moon-rune",
            dog[chain],
            5,
            chain,
            startOfDay
        );
        await processLog(
            burnDogLogs,
            dailyVolume,
            "dog-go-to-the-moon-rune",
            dog[chain],
            5,
            chain,
            startOfDay
        );
    }

    if (ordi[chain] != undefined) {
        const mintOrdiLogs = await getLogs({
            target: ordi[chain],
            eventAbi: mintAbi,
            entireLog: true,
        });

        const burnOrdiLogs = await getLogs({
            target: ordi[chain],
            eventAbi: burnAbi,
            entireLog: true,
        });

        await processLog(
            mintOrdiLogs,
            dailyVolume,
            "ordi",
            ordi[chain],
            18,
            chain,
            startOfDay
        );
        await processLog(
            burnOrdiLogs,
            dailyVolume,
            "ordi",
            ordi[chain],
            18,
            chain,
            startOfDay
        );
    }

    if (teleBtc[chain] != undefined) {
        const mintTeleBtcLogs = await getLogs({
            target: teleBtc[chain],
            eventAbi: mintAbi,
            entireLog: true,
        });

        const burnTeleBtcLogs = await getLogs({
            target: teleBtc[chain],
            eventAbi: burnAbi,
            entireLog: true,
        });

        await processLog(
            mintTeleBtcLogs,
            dailyVolume,
            "wrapped-bitcoin",
            teleBtc[chain],
            8,
            chain,
            startOfDay
        );
        await processLog(
            burnTeleBtcLogs,
            dailyVolume,
            "wrapped-bitcoin",
            teleBtc[chain],
            8,
            chain,
            startOfDay
        );
    }

    console.log(dailyVolume);

    return { timestamp, dailyVolume };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.POLYGON]: {
            fetch,
            start: "2023-11-26",
        },
        [CHAIN.BSC]: {
            fetch,
            start: "2023-12-03",
        },
        [CHAIN.BOB]: {
            fetch,
            start: "2024-07-23",
        },
        [CHAIN.BSQUARED]: {
            fetch,
            start: "2024-07-03",
        },
    },
};

export default adapter;

import { SimpleAdapter, FetchOptions, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Helium Mobile ran an HNT buy-and-burn: HNT is bought on the open market via
// automated Jupiter DCA, delivered to a buyback wallet, then burned (via Data Credit
// minting). We measure the USD value of HNT bought (HNT received by the buyback
// wallets). Nova Labs discontinued the program on 2026-01-02, so the buyback is 0
// from that date.
//
// We measure only the on-chain buy-and-burn amount. The funds behind the buys arrive
// via payment processors (SpherePay, Helio) and treasury wallets (incl. SOL from
// Coinbase Prime), so the exact funding mix is not cleanly attributable on-chain.
//
// This tracks ONLY the buy-and-burn. It deliberately does NOT track Data Credits
// burned for network usage (carrier offload), which is valued at the $0.50/GB peg
// (HIP-149, while carriers pay ~$0.10/GB) and whose burned HNT is sourced from
// Coinbase hot wallets - an inflated usage metric, not a buy-and-burn.
const HNT_MINT = 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux';
const BUYBACK_END_TIMESTAMP = 1767312000; // 2026-01-02 00:00:00 UTC

// Buyback wallets that received the open-market-bought HNT:
// - buyz...: dedicated DCA buyback wallet (active 2025-10-21 -> 2025-11-26)
// - 2j65...: took over the daily DCA from 2025-11-27. Only counted from 2025-11-26
//   to exclude a one-time $181.9k seed transfer it received on 2025-11-20.
const BUYBACK_FILTER = `(
    to_owner = 'buyzuS9fLSBqkmNCHbmQP4SB72zSfAzPb3Cr9iFRhtM'
    or (to_owner = '2j65rdW1jZvrEUx1xzC9ctcVbDW9smw2TUMhp3REFhNR' and block_time >= timestamp '2025-11-26')
)`;

const fetch = async (options: FetchOptions) => {
	const dailyFees = options.createBalances();
	const dailyRevenue = options.createBalances();

	// Buyback ended 2026-01-02; report 0 from then on without hitting Dune.
	if (options.fromTimestamp < BUYBACK_END_TIMESTAMP) {
		const toTimestamp = Math.min(options.toTimestamp, BUYBACK_END_TIMESTAMP);
		// block_date is the partition key; filtering it enables partition pruning
		// so each daily run scans a single day (~0.15 Dune credits) instead of all history.
		const query = `select sum(amount_usd) as buyback
			from tokens_solana.transfers
			where token_mint_address = '${HNT_MINT}'
				and amount_display > 0
				and block_time >= from_unixtime(${options.fromTimestamp})
				and block_time < from_unixtime(${toTimestamp})
				and block_date >= cast(from_unixtime(${options.fromTimestamp}) as date)
				and block_date <= cast(from_unixtime(${toTimestamp}) as date)
				and ${BUYBACK_FILTER}`;
		const queryResults = await queryDuneSql(options, query);
		const buybackInUsd = queryResults.length > 0 ? queryResults[0].buyback || 0 : 0;

		dailyFees.addUSDValue(buybackInUsd, 'HNT Buyback');
		dailyRevenue.addUSDValue(buybackInUsd, 'HNT Buyback');
	}

	return {
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue: '0',
		dailyHoldersRevenue: dailyRevenue,
	};
}

const methodology = {
	Fees: 'USD value of HNT that Helium Mobile bought on the open market (via Jupiter DCA) and burned. The buyback program was discontinued on 2026-01-02.',
	Revenue: 'Same as fees: the value of HNT bought back and burned.',
	ProtocolRevenue: 'Protocol revenue is 0 (the buyback accrues entirely to HNT holders).',
	HoldersRevenue: 'HNT bought on the open market and burned, accruing value to HNT holders through supply reduction.',
};

const breakdownMethodology = {
	Fees: {
		'HNT Buyback': 'HNT bought on the open market by Helium Mobile and burned. Discontinued 2026-01-02.',
	},
	Revenue: {
		'HNT Buyback': 'HNT bought and burned. Discontinued 2026-01-02.',
	},
	HoldersRevenue: {
		'HNT Buyback': 'Open-market HNT buy-and-burn, accruing value to HNT holders through supply reduction. Discontinued 2026-01-02.',
	},
};

const adapters: SimpleAdapter = {
	version: 1,
	fetch,
	methodology,
	breakdownMethodology,
	chains: [CHAIN.SOLANA],
	dependencies: [Dependencies.DUNE],
	start: '2025-10-21',
	isExpensiveAdapter: true
};

export default adapters;

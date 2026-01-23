import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://www.unigox.com/

const START = '2025-09-01';
const HL_BUILDER_ADDRESS = '0xf8ead1ecc72dfbb87cdd7bf78450f7cf68d046a3';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })

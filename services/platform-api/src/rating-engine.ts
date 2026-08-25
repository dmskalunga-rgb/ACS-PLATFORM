export type RatingModel = 'FLAT' | 'PER_UNIT' | 'TIERED_GRADUATED';
export type RatingTier = { lower_bound: string; upper_bound: string | null; unit_rate: string };
const SCALE = 100_000_000n;
const decimal = (value: string): bigint => {
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error('Invalid decimal input.');
  const negative = value.startsWith('-');
  const parts = (negative ? value.slice(1) : value).split('.');
  const whole = parts[0] ?? '0';
  const fraction = parts[1] ?? '';
  if (fraction.length > 8) throw new Error('Decimal precision exceeds NUMERIC(24,8).');
  const result = BigInt(whole) * SCALE + BigInt((fraction + '00000000').slice(0, 8));
  return negative ? -result : result;
};
const product = (left: bigint, right: bigint) => (left * right) / SCALE;
const finalAmount = (value: bigint) => {
  const negative = value < 0n,
    absolute = negative ? -value : value,
    rounded = (absolute + 500_000n) / 1_000_000n;
  return `${negative ? '-' : ''}${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}`;
};
export function calculateRating(input: {
  pricingModel: RatingModel;
  quantity: string;
  flatAmount?: string | null;
  unitRate?: string | null;
  tiers?: readonly RatingTier[];
}) {
  const quantity = decimal(input.quantity);
  if (quantity < 0n) throw new Error('Rating quantity cannot be negative.');
  let total: bigint;
  if (input.pricingModel === 'FLAT') {
    if (!input.flatAmount) throw new Error('FLAT Rate Rule is incomplete.');
    total = decimal(input.flatAmount);
  } else if (input.pricingModel === 'PER_UNIT') {
    if (!input.unitRate) throw new Error('PER_UNIT Rate Rule is incomplete.');
    total = product(quantity, decimal(input.unitRate));
  } else {
    const tiers = [...(input.tiers ?? [])];
    if (!tiers.length) throw new Error('TIERED_GRADUATED Rate Rule is incomplete.');
    total = 0n;
    let covered = 0n;
    for (const tier of tiers) {
      const lower = decimal(tier.lower_bound),
        upper = tier.upper_bound === null ? quantity : decimal(tier.upper_bound);
      if (lower !== covered || upper <= lower)
        throw new Error('Graduated tiers are discontinuous or invalid.');
      if (quantity > lower)
        total += product((quantity < upper ? quantity : upper) - lower, decimal(tier.unit_rate));
      covered = upper;
      if (quantity <= upper) break;
    }
    if (covered < quantity) throw new Error('Graduated tiers do not cover quantity.');
  }
  return finalAmount(total);
}

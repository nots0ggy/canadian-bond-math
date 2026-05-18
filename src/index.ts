/**
 * Canadian bond math primitives. Zero dependencies. Pure functions.
 *
 * Conventions assumed by every function in this module:
 *   - All rates are expressed as decimals (5% = 0.05), not percentages.
 *   - Coupons pay semi-annually unless `paymentsPerYear` is overridden.
 *   - `par` defaults to 1000 (the convention used in CIRE / CFA exam math).
 *   - All durations and prices are computed from cash-flow first principles,
 *     not from a yield-curve interpolation. Use a real risk system if you
 *     need OIS-discounting, day-count conventions beyond actual/365, or
 *     callable-bond OAS pricing.
 */

export interface BondInputs {
  /** Coupon rate per year, as a decimal (e.g. 0.06 for 6%). */
  couponRate: number;
  /** Yield to maturity per year, as a decimal (e.g. 0.05 for 5%). */
  ytm: number;
  /** Whole number of full coupon periods remaining until maturity. */
  periodsRemaining: number;
  /** Par (face) value. Defaults to 1000. */
  par?: number;
  /** Coupon payments per year. Defaults to 2 (semi-annual). */
  paymentsPerYear?: number;
}

const DEFAULT_PAR = 1000;
const DEFAULT_PAYMENTS_PER_YEAR = 2;

function resolve(inputs: BondInputs): Required<BondInputs> {
  return {
    par: inputs.par ?? DEFAULT_PAR,
    paymentsPerYear: inputs.paymentsPerYear ?? DEFAULT_PAYMENTS_PER_YEAR,
    couponRate: inputs.couponRate,
    ytm: inputs.ytm,
    periodsRemaining: inputs.periodsRemaining,
  };
}

/**
 * Clean price of a fixed-coupon bond as the present value of the remaining
 * coupon stream plus the present value of par at maturity.
 *
 *   P = sum_{t=1..n} C / (1 + r/m)^t  +  par / (1 + r/m)^n
 *
 * where C = par * couponRate / m, r = ytm, m = paymentsPerYear, n = periodsRemaining.
 *
 * @example
 *   cleanPrice({ couponRate: 0.06, ytm: 0.06, periodsRemaining: 10 });
 *   // → 1000 (par bond)
 */
export function cleanPrice(inputs: BondInputs): number {
  const { par, paymentsPerYear, couponRate, ytm, periodsRemaining } = resolve(inputs);
  if (periodsRemaining <= 0) {
    throw new RangeError("periodsRemaining must be > 0");
  }
  const periodRate = ytm / paymentsPerYear;
  const couponCash = (par * couponRate) / paymentsPerYear;
  if (periodRate === 0) {
    return couponCash * periodsRemaining + par;
  }
  const annuityFactor = (1 - Math.pow(1 + periodRate, -periodsRemaining)) / periodRate;
  const pvCoupons = couponCash * annuityFactor;
  const pvPar = par * Math.pow(1 + periodRate, -periodsRemaining);
  return pvCoupons + pvPar;
}

export interface AccruedInputs {
  /** Coupon rate per year, as a decimal. */
  couponRate: number;
  /** Days elapsed since the most recent coupon date. */
  daysSinceLastCoupon: number;
  /** Days in the current coupon period (typically 182 or 183). */
  daysInPeriod: number;
  /** Par (face) value. Defaults to 1000. */
  par?: number;
  /** Coupon payments per year. Defaults to 2. */
  paymentsPerYear?: number;
}

/**
 * Accrued interest the buyer compensates the seller for on a settlement date
 * between two coupon dates.
 *
 *   AI = (par * couponRate / m) * (daysSinceLastCoupon / daysInPeriod)
 *
 * The dirty price (the amount actually wired) equals the clean price plus
 * accrued interest.
 */
export function accruedInterest(inputs: AccruedInputs): number {
  const par = inputs.par ?? DEFAULT_PAR;
  const paymentsPerYear = inputs.paymentsPerYear ?? DEFAULT_PAYMENTS_PER_YEAR;
  if (inputs.daysInPeriod <= 0) {
    throw new RangeError("daysInPeriod must be > 0");
  }
  if (inputs.daysSinceLastCoupon < 0 || inputs.daysSinceLastCoupon > inputs.daysInPeriod) {
    throw new RangeError("daysSinceLastCoupon must be in [0, daysInPeriod]");
  }
  const couponCash = (par * inputs.couponRate) / paymentsPerYear;
  return couponCash * (inputs.daysSinceLastCoupon / inputs.daysInPeriod);
}

export interface YtmInputs {
  /** Current market clean price of the bond. */
  cleanPrice: number;
  /** Coupon rate per year, as a decimal. */
  couponRate: number;
  /** Whole number of full coupon periods remaining. */
  periodsRemaining: number;
  /** Par value. Defaults to 1000. */
  par?: number;
  /** Coupon payments per year. Defaults to 2. */
  paymentsPerYear?: number;
  /** Newton-Raphson convergence tolerance. Defaults to 1e-9. */
  tolerance?: number;
  /** Newton-Raphson iteration cap. Defaults to 100. */
  maxIterations?: number;
}

/**
 * Yield to maturity solved by Newton-Raphson on the price equation. The seed
 * is the current-yield approximation, which converges in 3-5 iterations for
 * typical inputs.
 *
 * Returns the annualised yield as a decimal (e.g. 0.0612 for 6.12%).
 *
 * Throws if no root is found within `maxIterations`.
 */
export function yieldToMaturity(inputs: YtmInputs): number {
  const par = inputs.par ?? DEFAULT_PAR;
  const paymentsPerYear = inputs.paymentsPerYear ?? DEFAULT_PAYMENTS_PER_YEAR;
  const tolerance = inputs.tolerance ?? 1e-9;
  const maxIterations = inputs.maxIterations ?? 100;
  const { cleanPrice: price, couponRate, periodsRemaining } = inputs;

  if (price <= 0) throw new RangeError("cleanPrice must be > 0");
  if (periodsRemaining <= 0) throw new RangeError("periodsRemaining must be > 0");

  // Seed: current yield. Reasonable starting point for most bonds.
  const couponCash = (par * couponRate) / paymentsPerYear;
  let r = (couponCash * paymentsPerYear) / price;
  if (!Number.isFinite(r) || r <= -1) r = 0.05;

  for (let i = 0; i < maxIterations; i++) {
    const periodRate = r / paymentsPerYear;
    let priceAtR: number;
    let dPriceDr: number;

    if (periodRate === 0) {
      priceAtR = couponCash * periodsRemaining + par;
      // Analytic derivative at r=0 is the negative of average time to
      // each cash flow, divided by paymentsPerYear. Approximate via a
      // small bump and finite difference to avoid a separate code path.
      const bump = 1e-6;
      const bumpedPeriodRate = bump / paymentsPerYear;
      const af = (1 - Math.pow(1 + bumpedPeriodRate, -periodsRemaining)) / bumpedPeriodRate;
      const bumpedPrice = couponCash * af + par * Math.pow(1 + bumpedPeriodRate, -periodsRemaining);
      dPriceDr = (bumpedPrice - priceAtR) / bump;
    } else {
      const discount = Math.pow(1 + periodRate, -periodsRemaining);
      const af = (1 - discount) / periodRate;
      priceAtR = couponCash * af + par * discount;
      // dP/dr derivation, semi-numerical for robustness near singularities.
      const bump = 1e-7;
      const bumpedPeriodRate = (r + bump) / paymentsPerYear;
      const bumpedDiscount = Math.pow(1 + bumpedPeriodRate, -periodsRemaining);
      const bumpedAf = (1 - bumpedDiscount) / bumpedPeriodRate;
      const bumpedPrice = couponCash * bumpedAf + par * bumpedDiscount;
      dPriceDr = (bumpedPrice - priceAtR) / bump;
    }

    const diff = priceAtR - price;
    if (Math.abs(diff) < tolerance) return r;
    if (dPriceDr === 0) break;

    const next = r - diff / dPriceDr;
    // Clamp to keep the search inside a sane range.
    if (!Number.isFinite(next) || next <= -0.999) {
      r = Math.max(0.0001, r / 2);
    } else {
      r = next;
    }
  }

  throw new Error(
    `yieldToMaturity did not converge within ${maxIterations} iterations (last r = ${r})`,
  );
}

/**
 * Macaulay duration: the weighted-average time to cash flow, with weights
 * equal to each cash flow's present-value share of the bond's price.
 *
 *   D = sum_{t=1..n} t * PV(CF_t) / price       (in periods)
 *
 * The return value is in years (divided by paymentsPerYear).
 */
export function macaulayDuration(inputs: BondInputs): number {
  const { par, paymentsPerYear, couponRate, ytm, periodsRemaining } = resolve(inputs);
  if (periodsRemaining <= 0) {
    throw new RangeError("periodsRemaining must be > 0");
  }
  const periodRate = ytm / paymentsPerYear;
  const couponCash = (par * couponRate) / paymentsPerYear;
  let weightedSum = 0;
  let priceSum = 0;
  for (let t = 1; t <= periodsRemaining; t++) {
    const discount = Math.pow(1 + periodRate, -t);
    const cashFlow = t === periodsRemaining ? couponCash + par : couponCash;
    const pv = cashFlow * discount;
    weightedSum += t * pv;
    priceSum += pv;
  }
  const durationInPeriods = weightedSum / priceSum;
  return durationInPeriods / paymentsPerYear;
}

/**
 * Modified duration: the price-sensitivity measure (approximate percentage
 * change in price for a 1% change in yield).
 *
 *   D_mod = D_macaulay / (1 + ytm / paymentsPerYear)
 */
export function modifiedDuration(inputs: BondInputs): number {
  const { paymentsPerYear, ytm } = resolve(inputs);
  return macaulayDuration(inputs) / (1 + ytm / paymentsPerYear);
}

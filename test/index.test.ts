import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accruedInterest,
  cleanPrice,
  macaulayDuration,
  modifiedDuration,
  yieldToMaturity,
} from "../src/index.ts";

const approx = (a: number, b: number, eps = 1e-6) =>
  assert.ok(
    Math.abs(a - b) < eps,
    `expected ${a} to be within ${eps} of ${b}, diff = ${Math.abs(a - b)}`,
  );

describe("cleanPrice", () => {
  it("returns par when ytm equals couponRate", () => {
    approx(
      cleanPrice({ couponRate: 0.06, ytm: 0.06, periodsRemaining: 10 }),
      1000,
    );
  });

  it("returns a discount when ytm > couponRate", () => {
    const p = cleanPrice({ couponRate: 0.04, ytm: 0.06, periodsRemaining: 20 });
    assert.ok(p < 1000, `expected discount, got ${p}`);
  });

  it("returns a premium when ytm < couponRate", () => {
    const p = cleanPrice({ couponRate: 0.06, ytm: 0.04, periodsRemaining: 20 });
    assert.ok(p > 1000, `expected premium, got ${p}`);
  });

  it("handles ytm = 0 (no discounting)", () => {
    const p = cleanPrice({ couponRate: 0.05, ytm: 0, periodsRemaining: 10 });
    // 10 coupons of 25 (5% / 2 of $1000) + par = 1250
    approx(p, 1250);
  });

  it("matches a known 5-year semi-annual textbook price", () => {
    // 8% coupon, 6% YTM, 5 years, semi-annual = 10 periods.
    // Hand-calc: PV(coupons) at 3% + PV(par) at 3% over 10 periods.
    const p = cleanPrice({ couponRate: 0.08, ytm: 0.06, periodsRemaining: 10 });
    approx(p, 1085.30202814, 1e-6);
  });

  it("supports annual coupons via paymentsPerYear=1", () => {
    const p = cleanPrice({
      couponRate: 0.05,
      ytm: 0.05,
      periodsRemaining: 5,
      paymentsPerYear: 1,
    });
    approx(p, 1000);
  });

  it("throws on non-positive periods", () => {
    assert.throws(() =>
      cleanPrice({ couponRate: 0.05, ytm: 0.05, periodsRemaining: 0 }),
    );
  });
});

describe("accruedInterest", () => {
  it("returns zero on a coupon date", () => {
    approx(
      accruedInterest({
        couponRate: 0.06,
        daysSinceLastCoupon: 0,
        daysInPeriod: 182,
      }),
      0,
    );
  });

  it("returns a full coupon on the day before the next coupon", () => {
    const ai = accruedInterest({
      couponRate: 0.06,
      daysSinceLastCoupon: 182,
      daysInPeriod: 182,
    });
    // 6% of $1000 / 2 = $30 full coupon
    approx(ai, 30);
  });

  it("interpolates linearly", () => {
    const ai = accruedInterest({
      couponRate: 0.06,
      daysSinceLastCoupon: 91,
      daysInPeriod: 182,
    });
    approx(ai, 15);
  });

  it("rejects out-of-range days", () => {
    assert.throws(() =>
      accruedInterest({
        couponRate: 0.06,
        daysSinceLastCoupon: -1,
        daysInPeriod: 182,
      }),
    );
    assert.throws(() =>
      accruedInterest({
        couponRate: 0.06,
        daysSinceLastCoupon: 183,
        daysInPeriod: 182,
      }),
    );
  });
});

describe("yieldToMaturity", () => {
  it("recovers a known yield from a known price (par bond)", () => {
    const r = yieldToMaturity({
      cleanPrice: 1000,
      couponRate: 0.06,
      periodsRemaining: 10,
    });
    approx(r, 0.06, 1e-6);
  });

  it("recovers a discount-bond yield", () => {
    const r = yieldToMaturity({
      cleanPrice: 850,
      couponRate: 0.04,
      periodsRemaining: 20,
    });
    // Round-trip: price the bond at the recovered yield, should equal input.
    const p = cleanPrice({
      couponRate: 0.04,
      ytm: r,
      periodsRemaining: 20,
    });
    approx(p, 850, 1e-4);
  });

  it("recovers a premium-bond yield", () => {
    const r = yieldToMaturity({
      cleanPrice: 1150,
      couponRate: 0.07,
      periodsRemaining: 16,
    });
    const p = cleanPrice({
      couponRate: 0.07,
      ytm: r,
      periodsRemaining: 16,
    });
    approx(p, 1150, 1e-4);
  });

  it("handles zero-coupon (strip) bond", () => {
    const r = yieldToMaturity({
      cleanPrice: 500,
      couponRate: 0,
      periodsRemaining: 20,
    });
    // (1000/500)^(1/10) - 1 ≈ 0.07177, annualised semi-ann = 2 * 0.0353
    // Round-trip is the truth test.
    const p = cleanPrice({ couponRate: 0, ytm: r, periodsRemaining: 20 });
    approx(p, 500, 1e-4);
  });

  it("throws on invalid price", () => {
    assert.throws(() =>
      yieldToMaturity({ cleanPrice: 0, couponRate: 0.05, periodsRemaining: 10 }),
    );
  });
});

describe("macaulayDuration", () => {
  it("equals time to maturity for a zero-coupon bond", () => {
    const d = macaulayDuration({
      couponRate: 0,
      ytm: 0.05,
      periodsRemaining: 20,
    });
    // 20 semi-annual periods = 10 years.
    approx(d, 10, 1e-9);
  });

  it("is less than time to maturity for a coupon bond", () => {
    const d = macaulayDuration({
      couponRate: 0.06,
      ytm: 0.06,
      periodsRemaining: 20,
    });
    assert.ok(d < 10, `expected duration < 10, got ${d}`);
  });

  it("matches the computed duration for an 8% coupon, 6% YTM, 5-year semi-ann bond", () => {
    // Hand-derived: D = (sum t * CF_t / (1.03)^t) / price, then / 2 to get years.
    // Numerator sums to ~9239 across 10 periods; price ~1085.30; ratio ~8.5087
    // periods, / 2 = 4.254345 years.
    const d = macaulayDuration({
      couponRate: 0.08,
      ytm: 0.06,
      periodsRemaining: 10,
    });
    approx(d, 4.254345152, 1e-6);
  });
});

describe("modifiedDuration", () => {
  it("is shorter than Macaulay duration", () => {
    const inputs = { couponRate: 0.06, ytm: 0.06, periodsRemaining: 20 };
    const md = modifiedDuration(inputs);
    const mac = macaulayDuration(inputs);
    assert.ok(md < mac, `expected modified < macaulay, got ${md} >= ${mac}`);
  });

  it("equals Macaulay when ytm = 0", () => {
    const inputs = { couponRate: 0.04, ytm: 0, periodsRemaining: 10 };
    approx(modifiedDuration(inputs), macaulayDuration(inputs), 1e-9);
  });
});

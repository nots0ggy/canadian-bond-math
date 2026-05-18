# @ciroexam/canadian-bond-math

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%9D%A4-db61a2)](https://github.com/sponsors/nots0ggy)

Zero-dependency Canadian bond math. Clean price, accrued interest, yield-to-maturity, Macaulay and modified duration.

Five pure functions. Pulled straight out of the formula engine behind [ciroexam.ca](https://ciroexam.ca), where they grade thousands of fixed-income practice questions a week.

## Install

```sh
npm install @ciroexam/canadian-bond-math
```

## Usage

```ts
import {
  cleanPrice,
  accruedInterest,
  yieldToMaturity,
  macaulayDuration,
  modifiedDuration,
} from "@ciroexam/canadian-bond-math";

// Par bond: 6% coupon, 6% YTM, 5 years semi-annual.
cleanPrice({ couponRate: 0.06, ytm: 0.06, periodsRemaining: 10 });
// → 1000

// Premium bond: 8% coupon, 6% YTM, 5 years semi-annual.
cleanPrice({ couponRate: 0.08, ytm: 0.06, periodsRemaining: 10 });
// → 1085.30

// Accrued interest halfway through the period.
accruedInterest({
  couponRate: 0.06,
  daysSinceLastCoupon: 91,
  daysInPeriod: 182,
});
// → 15.00 (half of the $30 semi-annual coupon on a $1000 par)

// Solve YTM from a market price (Newton-Raphson).
yieldToMaturity({
  cleanPrice: 850,
  couponRate: 0.04,
  periodsRemaining: 20,
});
// → 0.0517... (5.17% annualised)

// Macaulay duration in years.
macaulayDuration({ couponRate: 0.08, ytm: 0.06, periodsRemaining: 10 });
// → 4.254 years

// Modified duration: dP/P ≈ −D_mod * dy
modifiedDuration({ couponRate: 0.06, ytm: 0.06, periodsRemaining: 20 });
// → ~7.36 years
```

## API

### `cleanPrice({ couponRate, ytm, periodsRemaining, par?, paymentsPerYear? })`

Present value of the coupon stream plus the present value of par at maturity.

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `couponRate` | `number` | required | Annual coupon rate as a decimal (`0.06` = 6%) |
| `ytm` | `number` | required | Yield to maturity as an annual decimal |
| `periodsRemaining` | `number` | required | Whole coupon periods remaining until maturity |
| `par` | `number` | `1000` | Face value |
| `paymentsPerYear` | `number` | `2` | Coupon frequency (CIRE convention: semi-annual) |

### `accruedInterest({ couponRate, daysSinceLastCoupon, daysInPeriod, par?, paymentsPerYear? })`

Coupon interest the buyer compensates the seller for on a settlement date
between two coupon dates. `dirty price = clean price + accrued interest`.

### `yieldToMaturity({ cleanPrice, couponRate, periodsRemaining, par?, paymentsPerYear?, tolerance?, maxIterations? })`

YTM solved by Newton-Raphson on the price equation. Converges in 3 to 5 iterations for normal inputs. Throws if no root is found within `maxIterations` (default 100).

### `macaulayDuration({ couponRate, ytm, periodsRemaining, par?, paymentsPerYear? })`

Weighted-average time to cash flow, where weights are each cash flow's
present-value share of the bond price. Returned in years.

### `modifiedDuration(inputs)`

`D_mod = D_macaulay / (1 + ytm / paymentsPerYear)`. The standard
price-sensitivity measure (approximate percent change in price for a 1%
change in yield).

## Conventions and limitations

Exam-grade math. Don't price a book with it. The functions assume:

- Coupons pay on schedule with no skipped payments
- Day count is implicit in `daysSinceLastCoupon` / `daysInPeriod` (set those days upstream for actual/actual or 30/360)
- One flat YTM discounts every cash flow. No zero-curve, no OAS.
- Bonds are option-free (no embedded call, put, or convertible feature)

For OIS-discounting, callable bond OAS pricing, or fitted curves, reach for a real risk system.

## Why this exists

We run [ciroexam.ca](https://ciroexam.ca), the CIRE / CIRO Proficiency Model prep platform that replaced the old Canadian Securities Course track in 2026. Fixed-income math is one of the worst-scoring sections on the CIRE. These functions grade our students' practice questions every day, so we may as well open-source them.

Studying for the CIRE? The [free 25-question diagnostic](https://ciroexam.ca/diagnostic) returns a sectioned score against the published blueprint.

## Sponsor

Saved you a few hours of re-implementing bond pricing? [Sponsor on GitHub](https://github.com/sponsors/nots0ggy).

## License

MIT © [ciroexam.ca](https://ciroexam.ca)

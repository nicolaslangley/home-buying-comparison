// Thresholds and toggles
export interface GlobalSettings {
  targetSavingsPct: number;        // fraction of gross, e.g. 0.25 = 25%
  targetHousingPct: number;        // fraction of gross, used for badge coloring
  targetLeftoverSpending: number;  // monthly after housing + savings
  includePrincipalInSavings: boolean; // when true, principal paydown counts toward savings target
}

// 401k contributions are pre-tax deductions that reduce federal taxable income
export interface WAIncome {
  salary1: number;
  salary2: number;
  contribution401k1: number;
  contribution401k2: number;
}

export interface Property {
  id: string;
  name: string;
  listingUrl: string;
  cost: number;
  downPayment1: number;
  downPayment2: number;
  interestRate: number;   // stored as decimal, e.g. 0.065 = 6.5%
  durationMonths: number;
  monthlyTaxes: number;
  monthlyInsurance: number;
  hoa: number;
  fixedMonthlyExpenses: number; // non-housing fixed costs (subscriptions, utilities, etc.)
  childcareCosts: number;
}

// Derived values from a Property + IncomeCalcs
export interface PropertyCalcs {
  loanAmount: number;
  monthlyPI: number;        // principal + interest payment
  monthlyPrincipal: number; // average principal portion over first 60 months
  totalMonthly: number;     // P&I + taxes + insurance + HOA
  pctOfGross: number;       // totalMonthly as fraction of monthly gross
  pctOfNet: number;         // totalMonthly as fraction of monthly net
  remainingIncome: number;  // net - totalMonthly - savings target (after optional principal credit)
  annualMaintenance: number; // 0.5% of purchase price per year
  pctOnFixed: number;       // fraction of net consumed by all fixed costs
  remainingDiscretionary: number; // net after all fixed costs
}

// Derived from WAIncome (annual unless field name says otherwise)
export interface IncomeCalcs {
  grossHousehold: number;
  monthlyGross: number;
  totalDeductions: number;      // pre-tax retirement contributions
  taxes: number;                // estimated annual tax burden
  netAnnual: number;
  netMonthly: number;
  savingsTarget: number;        // annual: gross * savingsPct - deductions
  monthlySavingsTarget: number;
}

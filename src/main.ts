import './style.css';
import { calcWAIncome, calcProperty } from './calculator';
import type { GlobalSettings, WAIncome, Property, IncomeCalcs, PropertyCalcs } from './types';

// --- State ---
// All mutable state lives here as plain objects. No framework — changes trigger
// targeted DOM updates (income results, property result panels) or a full re-render
// (add/remove property). Full re-renders are cheap because inputs are few.

const settings: GlobalSettings = {
  targetSavingsPct: 0.25,
  targetHousingPct: 0.30,
  targetLeftoverSpending: 9000,
  includePrincipalInSavings: false,
};

const income: WAIncome = {
  salary1: 0,
  salary2: 0,
  contribution401k1: 0,
  contribution401k2: 0,
};

let properties: Property[] = [];
let nextId = 1;

function newProperty(): Property {
  return {
    id: String(nextId++),
    name: '',
    listingUrl: '',
    cost: 0,
    downPayment1: 0,
    downPayment2: 0,
    interestRate: 0.065, // 6.5% default — reasonable mid-2024 30yr rate
    durationMonths: 360,
    monthlyTaxes: 0,
    monthlyInsurance: 0,
    hoa: 0,
    fixedMonthlyExpenses: 0,
    childcareCosts: 0,
  };
}

// --- Formatting ---

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// Returns CSS class for color-coded badges: good (≤warn), warn (warn..bad], bad (>bad).
function badgeClass(n: number, warn: number, bad: number) {
  if (n <= warn) return 'badge-good';
  if (n <= bad) return 'badge-warn';
  return 'badge-bad';
}

// --- Settings UI ---

function renderSettings() {
  return `
    <div class="settings-grid">
      <div class="settings-field">
        <label>Savings target (% gross)</label>
        <input type="number" id="s-savings-pct" value="${(settings.targetSavingsPct * 100).toFixed(0)}" min="0" max="100" step="1">
      </div>
      <div class="settings-field">
        <label>Housing target (% gross)</label>
        <input type="number" id="s-housing-pct" value="${(settings.targetHousingPct * 100).toFixed(0)}" min="0" max="100" step="1">
      </div>
      <div class="settings-field">
        <label>Leftover spending target / mo</label>
        <input type="number" id="s-leftover" value="${settings.targetLeftoverSpending}" min="0" step="500">
      </div>
      <div class="toggle-field">
        <span class="toggle-label">Principal counts as savings</span>
        <div class="toggle-row">
          <input type="checkbox" id="s-principal" ${settings.includePrincipalInSavings ? 'checked' : ''}>
          <label for="s-principal" style="font-size:0.875rem">Include principal</label>
        </div>
      </div>
    </div>`;
}

// --- Income section ---

function renderIncomeInputs() {
  return `
    <div class="income-card">
      <h3>Income &amp; Deductions</h3>
      <div class="income-inputs-grid">
        <div class="field">
          <label>Partner 1 Gross Salary</label>
          <input type="number" data-income="salary1" value="${income.salary1 || ''}" placeholder="0" min="0" step="1000">
        </div>
        <div class="field">
          <label>Partner 2 Gross Salary</label>
          <input type="number" data-income="salary2" value="${income.salary2 || ''}" placeholder="0" min="0" step="1000">
        </div>
        <div class="field">
          <label>Partner 1 401k</label>
          <input type="number" data-income="contribution401k1" value="${income.contribution401k1 || ''}" placeholder="0" min="0" step="500">
        </div>
        <div class="field">
          <label>Partner 2 401k</label>
          <input type="number" data-income="contribution401k2" value="${income.contribution401k2 || ''}" placeholder="0" min="0" step="500">
        </div>
      </div>
    </div>`;
}

function renderIncomeResults(calcs: IncomeCalcs) {
  return `
    <div class="income-card" id="income-results">
      <h3>Calculated</h3>
      <div class="result-row">
        <span class="result-label">Household Gross</span>
        <span class="result-value">${usd.format(calcs.grossHousehold)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Total Pre-tax Deductions</span>
        <span class="result-value">${usd.format(calcs.totalDeductions)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Est. Taxes</span>
        <span class="result-value">${usd.format(calcs.taxes)}</span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Net Annual</span>
        <span class="result-value">${usd.format(calcs.netAnnual)}</span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Net Monthly</span>
        <span class="result-value">${usd.format(calcs.netMonthly)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Monthly Savings Target</span>
        <span class="result-value">${usd.format(calcs.monthlySavingsTarget)}</span>
      </div>
    </div>`;
}

// --- Property card ---

function renderPropertyCard(prop: Property) {
  return `
    <div class="property-card" data-id="${prop.id}">
      <div class="property-card-header">
        <input class="property-name-input" type="text" placeholder="Property name / address"
          data-prop-field="name" value="${prop.name}">
        ${prop.listingUrl ? `<a class="listing-link" href="${prop.listingUrl}" target="_blank" rel="noopener">View listing ↗</a>` : ''}
        <button class="btn-remove" data-remove-id="${prop.id}" title="Remove">×</button>
      </div>
      <div class="property-inputs">
        <div class="url-field">
          <input type="url" placeholder="Redfin / Zillow URL (optional)"
            data-prop-field="listingUrl" value="${prop.listingUrl}">
        </div>
        <div class="property-inputs-grid">
          <div class="field">
            <label>Purchase Price</label>
            <input type="number" data-prop-field="cost" value="${prop.cost || ''}" placeholder="0" min="0" step="10000">
          </div>
          <div class="field">
            <label>Interest Rate (%)</label>
            <input type="number" data-prop-field="interestRate" value="${(prop.interestRate * 100).toFixed(3)}" placeholder="6.5" min="0" max="20" step="0.125">
          </div>
          <div class="field">
            <label>Partner 1 Down</label>
            <input type="number" data-prop-field="downPayment1" value="${prop.downPayment1 || ''}" placeholder="0" min="0" step="5000">
          </div>
          <div class="field">
            <label>Partner 2 Down</label>
            <input type="number" data-prop-field="downPayment2" value="${prop.downPayment2 || ''}" placeholder="0" min="0" step="5000">
          </div>
          <div class="field">
            <label>Monthly Taxes</label>
            <input type="number" data-prop-field="monthlyTaxes" value="${prop.monthlyTaxes || ''}" placeholder="0" min="0" step="50">
          </div>
          <div class="field">
            <label>Monthly Insurance</label>
            <input type="number" data-prop-field="monthlyInsurance" value="${prop.monthlyInsurance || ''}" placeholder="0" min="0" step="10">
          </div>
          <div class="field">
            <label>HOA / mo</label>
            <input type="number" data-prop-field="hoa" value="${prop.hoa || ''}" placeholder="0" min="0" step="25">
          </div>
          <div class="field">
            <label>Loan Term (months)</label>
            <input type="number" data-prop-field="durationMonths" value="${prop.durationMonths}" placeholder="360" min="60" max="480" step="12">
          </div>
          <div class="field">
            <label>Fixed Monthly Expenses</label>
            <input type="number" data-prop-field="fixedMonthlyExpenses" value="${prop.fixedMonthlyExpenses || ''}" placeholder="0" min="0" step="100">
          </div>
          <div class="field">
            <label>Childcare / mo</label>
            <input type="number" data-prop-field="childcareCosts" value="${prop.childcareCosts || ''}" placeholder="0" min="0" step="100">
          </div>
        </div>
      </div>
      <div class="property-results" id="results-${prop.id}">
        <p style="color:var(--text-secondary);font-size:0.875rem">Enter property details above to see calculations.</p>
      </div>
    </div>`;
}

function renderPropertyResults(prop: Property, calcs: PropertyCalcs) {
  const housingPctClass = badgeClass(calcs.pctOfGross, settings.targetHousingPct, settings.targetHousingPct + 0.05);
  const remainClass = calcs.remainingIncome >= settings.targetLeftoverSpending ? 'badge-good'
    : calcs.remainingIncome >= settings.targetLeftoverSpending * 0.8 ? 'badge-warn' : 'badge-bad';
  const discClass = calcs.remainingDiscretionary >= 3000 ? 'badge-good'
    : calcs.remainingDiscretionary >= 1500 ? 'badge-warn' : 'badge-bad';

  const down = prop.downPayment1 + prop.downPayment2;
  const downPct = prop.cost > 0 ? down / prop.cost : 0;

  return `
    <div class="result-group">
      <div class="result-group-title">Loan</div>
      <div class="result-row">
        <span class="result-label">Down Payment</span>
        <span class="result-value">
          ${usd.format(down)}
          <span class="result-sub">${pct(downPct)} of price</span>
        </span>
      </div>
      <div class="result-row">
        <span class="result-label">Loan Amount</span>
        <span class="result-value">${usd.format(calcs.loanAmount)}</span>
      </div>
    </div>
    <div class="result-group">
      <div class="result-group-title">Monthly Costs</div>
      <div class="result-row">
        <span class="result-label">Principal &amp; Interest</span>
        <span class="result-value">${usd.format(calcs.monthlyPI)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Taxes + Insurance + HOA</span>
        <span class="result-value">${usd.format(prop.monthlyTaxes + prop.monthlyInsurance + prop.hoa)}</span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Total Monthly</span>
        <span class="result-value">${usd.format(calcs.totalMonthly)}</span>
      </div>
    </div>
    <div class="result-group">
      <div class="result-group-title">Affordability</div>
      <div class="result-row">
        <span class="result-label">% of Gross</span>
        <span class="result-value">
          <span class="badge ${housingPctClass}">${pct(calcs.pctOfGross)}</span>
          <span class="result-sub">target ≤ ${pct(settings.targetHousingPct)}</span>
        </span>
      </div>
      <div class="result-row">
        <span class="result-label">% of Net</span>
        <span class="result-value">${pct(calcs.pctOfNet)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Remaining (after housing + savings)</span>
        <span class="result-value">
          <span class="badge ${remainClass}">${usd.format(calcs.remainingIncome)}/mo</span>
        </span>
      </div>
    </div>
    <div class="result-group">
      <div class="result-group-title">Full Budget</div>
      <div class="result-row">
        <span class="result-label">Annual Maintenance (0.5%)</span>
        <span class="result-value">${usd.format(calcs.annualMaintenance)}/yr</span>
      </div>
      <div class="result-row">
        <span class="result-label">% on Fixed Costs</span>
        <span class="result-value">${pct(calcs.pctOnFixed)}</span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Remaining Discretionary</span>
        <span class="result-value">
          <span class="badge ${discClass}">${usd.format(calcs.remainingDiscretionary)}/mo</span>
        </span>
      </div>
    </div>`;
}

// --- Render ---

function getApp() {
  return document.getElementById('app')!;
}

// Full re-render: replaces all DOM. Used for structural changes (add/remove property).
// After replacing innerHTML, updateAllPropertyResults() fills in the result panels,
// then attachListeners() wires delegated click/input handlers to the new DOM root.
function render() {
  const incomeCalcs = calcWAIncome(income, settings);

  getApp().innerHTML = `
    <header class="site-header">
      <div class="container">
        <h1>Home Buying Calculator</h1>
        <p>Seattle, WA</p>
      </div>
    </header>

    <main>
      <div class="container">
        <section class="settings-section">
          <h2 class="section-title">Settings</h2>
          ${renderSettings()}
        </section>
        <section class="income-section">
          <h2 class="section-title">Income</h2>
          <div class="income-layout">
            ${renderIncomeInputs()}
            ${renderIncomeResults(incomeCalcs)}
          </div>
        </section>
        <section class="properties-section">
          <div class="properties-header">
            <h2 class="section-title" style="margin-bottom:0">Properties</h2>
            <button class="btn-add" id="add-prop">+ Add Property</button>
          </div>
          <div class="properties-grid" id="props">
            ${properties.map(p => renderPropertyCard(p)).join('')}
          </div>
        </section>
      </div>
    </main>`;

  updateAllPropertyResults();
  attachListeners();
}

function updateAllPropertyResults() {
  const incomeCalcs = calcWAIncome(income, settings);
  for (const prop of properties) {
    updatePropertyResult(prop, incomeCalcs);
  }
}

// Partially updates a single property's result panel without touching its input fields.
// Skips calculation if required fields are missing to avoid divide-by-zero noise.
function updatePropertyResult(prop: Property, incomeCalcs: IncomeCalcs) {
  const el = document.getElementById(`results-${prop.id}`);
  if (!el) return;
  if (!prop.cost || !prop.interestRate || !prop.durationMonths) {
    el.innerHTML = `<p style="color:var(--text-secondary);font-size:0.875rem">Enter property details above to see calculations.</p>`;
    return;
  }
  el.innerHTML = renderPropertyResults(prop, calcProperty(prop, incomeCalcs, settings));
}

// Swaps only the "Calculated" income card in-place rather than calling render().
// A full re-render would reset scroll position.
function updateIncomeResults() {
  const incomeCalcs = calcWAIncome(income, settings);
  const el = document.getElementById('income-results');
  if (el) el.outerHTML = renderIncomeResults(incomeCalcs);
}

// --- Event handling (delegated) ---
// All click and input events bubble up to #app, avoiding per-element listener management.
// data-* attributes on inputs identify which state field to update.

function attachListeners() {
  const app = getApp();

  app.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'add-prop') {
      properties.push(newProperty());
      render();
      return;
    }

    const removeBtn = (e.target as HTMLElement).closest('[data-remove-id]') as HTMLElement | null;
    if (removeBtn) {
      const id = removeBtn.dataset.removeId!;
      properties = properties.filter(p => p.id !== id);
      render();
    }
  });

  app.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;

    // Global settings
    if (target.id === 's-savings-pct') { settings.targetSavingsPct = parseFloat(target.value) / 100 || 0.25; updateIncomeResults(); updateAllPropertyResults(); return; }
    if (target.id === 's-housing-pct') { settings.targetHousingPct = parseFloat(target.value) / 100 || 0.30; updateAllPropertyResults(); return; }
    if (target.id === 's-leftover') { settings.targetLeftoverSpending = parseFloat(target.value) || 9000; updateAllPropertyResults(); return; }
    if (target.id === 's-principal') { settings.includePrincipalInSavings = target.checked; updateAllPropertyResults(); return; }

    // Income fields
    const incomeField = target.dataset.income as keyof WAIncome | undefined;
    if (incomeField) {
      (income as unknown as Record<string, number>)[incomeField] = parseFloat(target.value) || 0;
      updateIncomeResults();
      updateAllPropertyResults();
      return;
    }

    // Property fields
    const propField = target.dataset.propField as keyof Property | undefined;
    if (propField) {
      const card = target.closest('[data-id]') as HTMLElement | null;
      if (!card) return;
      const prop = properties.find(p => p.id === card.dataset.id!);
      if (!prop) return;

      if (propField === 'name' || propField === 'listingUrl') {
        (prop as unknown as Record<string, string>)[propField] = target.value;
        if (propField === 'listingUrl') {
          // Update listing link in header without re-rendering the whole card
          const header = card.querySelector('.property-card-header')!;
          let link = header.querySelector('.listing-link') as HTMLAnchorElement | null;
          if (target.value) {
            const parsed = parseListingUrl(target.value);
            if (!link) {
              link = document.createElement('a');
              link.className = 'listing-link';
              link.target = '_blank';
              link.rel = 'noopener';
              header.insertBefore(link, header.querySelector('.btn-remove'));
            }
            link.href = target.value;
            link.textContent = 'View listing ↗';
            if (parsed.address && !prop.name) {
              prop.name = parsed.address;
              const nameInput = card.querySelector('.property-name-input') as HTMLInputElement;
              if (nameInput) nameInput.value = parsed.address;
            }
          } else if (link) {
            link.remove();
          }
        }
        return;
      }

      let val = parseFloat(target.value) || 0;
      if (propField === 'interestRate') val = val / 100; // UI shows %, state stores decimal
      (prop as unknown as Record<string, number>)[propField] = val;
      updatePropertyResult(prop, calcWAIncome(income, settings));
    }
  });
}

// Extracts a human-readable address from Redfin/Zillow URLs by parsing the path slug.
// Redfin URL shape: /STATE/City/Street-Address-Zip/home/id
// Zillow URL shape: /homedetails/street-address-city-state-zip/zpid/
function parseListingUrl(url: string): { address: string } {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    let slug = '';
    if (u.hostname.includes('redfin')) {
      slug = segments[2] ?? ''; // address segment is at index 2 after state/city
    } else if (u.hostname.includes('zillow')) {
      slug = segments[1] ?? ''; // address segment is at index 1 after 'homedetails'
    } else {
      slug = segments[0] ?? '';
    }
    return { address: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
  } catch {
    return { address: '' };
  }
}

render();

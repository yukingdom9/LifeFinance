// =====================================================================
// 共通ユーティリティ
// =====================================================================

function formatCurrency(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function formatWithdrawAxis(value) {
  return `${(value / 10000).toLocaleString("ja-JP", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}万円`;
}

function formatPrincipalAxis(value) {
  if (value >= 100000000) {
    const valueInOku = value / 100000000;
    return `${valueInOku.toLocaleString("ja-JP", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    })}億円`;
  }

  return `${(value / 10000).toLocaleString("ja-JP", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}万円`;
}

function formatNumber(value) {
  return value.toLocaleString("ja-JP");
}

function getNiceMax(value) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function clamp(value, min, max) {
  return Number.isNaN(value) ? min : Math.min(Math.max(value, min), max);
}

// =====================================================================
// DOM参照と、フェーズ間で共有する状態
// =====================================================================

const a = {
  principal: document.getElementById("a-principal"),
  monthly: document.getElementById("a-monthly"),
  rate: document.getElementById("a-rate"),
  years: document.getElementById("a-years"),

  principalValue: document.getElementById("a-principal-value"),
  monthlyValue: document.getElementById("a-monthly-value"),
  rateValue: document.getElementById("a-rate-value"),
  yearsValue: document.getElementById("a-years-value"),

  finalBalance: document.getElementById("a-final-balance"),
  totalContribution: document.getElementById("a-total-contribution"),
  profit: document.getElementById("a-profit"),
  chart: document.getElementById("accumulate-chart"),
};

const w = {
  principal: document.getElementById("w-principal"),
  rate: document.getElementById("w-rate"),
  withdrawal: document.getElementById("w-withdrawal"),

  principalValue: document.getElementById("w-principal-value"),
  rateValue: document.getElementById("w-rate-value"),
  withdrawalValue: document.getElementById("w-withdrawal-value"),

  finalBalance: document.getElementById("w-final-balance"),
  withdrawalInitial: document.getElementById("w-withdrawal-initial"),
  withdrawal20y: document.getElementById("w-withdrawal-20y"),
  withdrawal40y: document.getElementById("w-withdrawal-40y"),
  chart: document.getElementById("withdraw-chart"),
};

const linkToggle = document.getElementById("link-toggle");
const linkedReadout = document.getElementById("linked-readout");
const connectorFinalBalance = document.getElementById("connector-final-balance");
const copyLinkBtn = document.getElementById("copyLinkBtn");

// 積立フェーズの最終残高（連携ONのときに取崩フェーズの元本として使われる）
let latestFinalBalance = 0;
// 連携トグルの現在値
let isLinked = linkToggle.checked;
// 定率取崩フェーズの「毎月の取崩額」（最終統合結果に使用する生の数値）
let latestWithdrawalInitial = 0;

// =====================================================================
// Stage 1: 積立投資シミュレーション
// =====================================================================

function getProjection(principal, monthly, annualRate, years) {
  const months = years * 12;
  const balances = [principal];
  let balance = principal;
  let totalContribution = principal;

  for (let month = 1; month <= months; month += 1) {
    balance = balance * (1 + annualRate / 100 / 12) + monthly;
    totalContribution += monthly;
    balances.push(balance);
  }

  return {
    balances,
    totalContribution,
    finalBalance: balance,
    profit: balance - totalContribution,
  };
}

function drawAccumulateChart(balances, years) {
  const width = 760;
  const height = 420;
  const margin = { top: 24, right: 24, bottom: 48, left: 84 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const maxValue = getNiceMax(Math.max(...balances, 1) * 1.1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxValue * t);

  a.chart.innerHTML = "";

  a.chart.appendChild(svgEl("rect", { x: 0, y: 0, width, height, fill: "#f4f6fb", rx: 20 }));
  a.chart.appendChild(
    svgEl("rect", {
      x: margin.left,
      y: margin.top,
      width: plotWidth,
      height: plotHeight,
      fill: "#ffffff",
      stroke: "#dbe2ec",
    })
  );

  ticks.forEach((tickValue, index) => {
    const y = margin.top + plotHeight * (1 - index / 4);
    a.chart.appendChild(
      svgEl("line", {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        stroke: "rgba(36,70,111,0.12)",
      })
    );
    const label = svgEl("text", {
      x: margin.left - 12,
      y: y + 4,
      fill: "#7b8aa3",
      "font-size": 12,
      "text-anchor": "end",
    });
    label.textContent = formatPrincipalAxis(tickValue);
    a.chart.appendChild(label);
  });

  a.chart.appendChild(
    svgEl("line", {
      x1: margin.left,
      y1: height - margin.bottom,
      x2: width - margin.right,
      y2: height - margin.bottom,
      stroke: "#a9b7cc",
    })
  );
  a.chart.appendChild(
    svgEl("line", {
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: height - margin.bottom,
      stroke: "#a9b7cc",
    })
  );

  const linePoints = balances.map((value, index) => {
    const x = margin.left + (index / (balances.length - 1)) * plotWidth;
    const y = margin.top + plotHeight * (1 - Math.max(0, value) / maxValue);
    return { x, y };
  });

  const pathData = linePoints
    .map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  a.chart.appendChild(
    svgEl("path", {
      d: pathData,
      fill: "none",
      stroke: "#336485",
      "stroke-width": 3.5,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    })
  );

  for (let year = 0; year <= years; year += Math.max(1, Math.round(years / 4))) {
    const x = margin.left + (year / years) * plotWidth;
    const label = svgEl("text", {
      x,
      y: height - margin.bottom + 24,
      fill: "#7b8aa3",
      "font-size": 12,
      "text-anchor": "middle",
    });
    label.textContent = `${year}年`;
    a.chart.appendChild(label);
  }
}

function renderAccumulate() {
  const principal = Number(a.principal.value);
  const monthly = Number(a.monthly.value);
  const annualRate = Number(a.rate.value);
  const years = Number(a.years.value);

  a.principalValue.value = formatCurrency(principal);
  a.monthlyValue.value = formatCurrency(monthly);
  a.rateValue.value = formatPercent(annualRate);
  a.yearsValue.value = `${years}年`;

  const projection = getProjection(principal, monthly, annualRate, years);

  a.finalBalance.textContent = formatCurrency(projection.finalBalance);
  a.totalContribution.textContent = formatCurrency(projection.totalContribution);
  a.profit.textContent = formatCurrency(projection.profit);

  drawAccumulateChart(projection.balances, years);

  latestFinalBalance = projection.finalBalance;
  connectorFinalBalance.textContent = formatCurrency(latestFinalBalance);

  if (isLinked) {
    syncLinkedPrincipal();
  }

  syncShareUrl();
}

[a.principal, a.monthly, a.rate, a.years].forEach((input) => {
  input.addEventListener("input", renderAccumulate);
});

// =====================================================================
// Stage 2: 定率取崩シミュレーション
// =====================================================================

function buildWithdrawalSeries(principal, annualRate, withdrawalRate) {
  const monthlyRate = annualRate / 100 / 12;
  const months = 40 * 12;
  const points = [{ x: 0, y: principal }];
  const bars = [];
  let balance = principal;

  for (let month = 1; month <= months; month += 1) {
    const withdrawal = (balance * (withdrawalRate / 100)) / 12;
    balance = balance + balance * monthlyRate - withdrawal;
    bars.push(withdrawal);

    if (balance <= 0) {
      balance = 0;
    }

    points.push({ x: month / 12, y: balance });
  }

  return { points, bars };
}

function drawWithdrawChart(series) {
  const width = 760;
  const height = 420;
  const margin = { top: 24, right: 80, bottom: 48, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const months = series.bars.length;

  const maxLeft = getNiceMax(Math.max(...series.bars, 1) * 1.1);
  const maxRight = getNiceMax(Math.max(...series.points.map((p) => p.y), 1) * 1.1);
  const leftTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxLeft * t);
  const rightTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxRight * t);

  w.chart.innerHTML = "";

  w.chart.appendChild(svgEl("rect", { x: 0, y: 0, width, height, fill: "#f4f6fb", rx: 20 }));
  w.chart.appendChild(
    svgEl("rect", {
      x: margin.left,
      y: margin.top,
      width: plotWidth,
      height: plotHeight,
      fill: "#ffffff",
      stroke: "#dbe2ec",
    })
  );

  leftTicks.forEach((tickValue, index) => {
    const y = margin.top + plotHeight * (1 - index / 4);
    w.chart.appendChild(
      svgEl("line", {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        stroke: "rgba(36,70,111,0.12)",
      })
    );
    const label = svgEl("text", {
      x: margin.left - 10,
      y: y + 4,
      fill: "#336485",
      "font-size": 12,
      "text-anchor": "end",
    });
    label.textContent = formatWithdrawAxis(tickValue);
    w.chart.appendChild(label);
  });

  rightTicks.forEach((tickValue, index) => {
    const y = margin.top + plotHeight * (1 - index / 4);
    const label = svgEl("text", {
      x: width - margin.right + 10,
      y: y + 4,
      fill: "#7b8aa3",
      "font-size": 12,
      "text-anchor": "start",
    });
    label.textContent = formatPrincipalAxis(tickValue);
    w.chart.appendChild(label);
  });

  w.chart.appendChild(
    svgEl("line", {
      x1: margin.left,
      y1: height - margin.bottom,
      x2: width - margin.right,
      y2: height - margin.bottom,
      stroke: "#a9b7cc",
    })
  );
  w.chart.appendChild(
    svgEl("line", {
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: height - margin.bottom,
      stroke: "#a9b7cc",
    })
  );

  const baselineY = margin.top + plotHeight;
  const balancePoints = series.points.map((point) => {
    const x = margin.left + (point.x / 40) * plotWidth;
    const y = margin.top + plotHeight * (1 - Math.max(0, point.y) / maxRight);
    return { x, y };
  });

  const areaData = [
    `M${balancePoints[0].x.toFixed(2)} ${baselineY.toFixed(2)}`,
    ...balancePoints.map((p) => `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
    `L${balancePoints[balancePoints.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)}`,
    "Z",
  ].join(" ");
  w.chart.appendChild(svgEl("path", { d: areaData, fill: "#D2DDE9", opacity: 0.85 }));

  const balanceOutlineData = balancePoints
    .map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  w.chart.appendChild(
    svgEl("path", {
      d: balanceOutlineData,
      fill: "none",
      stroke: "#B7BEC2",
      "stroke-width": 0.75,
      "stroke-linejoin": "round",
    })
  );

  const withdrawalLinePoints = series.bars.map((value, index) => {
    const x = margin.left + (index / months) * plotWidth;
    const y = margin.top + plotHeight * (1 - Math.max(0, Math.min(maxLeft, value)) / maxLeft);
    return { x, y };
  });
  const pathData = withdrawalLinePoints
    .map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  w.chart.appendChild(
    svgEl("path", {
      d: pathData,
      fill: "none",
      stroke: "#336485",
      "stroke-width": 3.5,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    })
  );

  for (let year = 0; year <= 40; year += 10) {
    const x = margin.left + (year / 40) * plotWidth;
    const label = svgEl("text", {
      x,
      y: height - margin.bottom + 24,
      fill: "#7b8aa3",
      "font-size": 12,
      "text-anchor": "middle",
    });
    label.textContent = `${year}年`;
    w.chart.appendChild(label);
  }

  const legend = svgEl("g", {});
  const lineLegend = svgEl("line", {
    x1: margin.left + 8,
    y1: 16,
    x2: margin.left + 28,
    y2: 16,
    stroke: "#336485",
    "stroke-width": 3.5,
  });
  legend.appendChild(lineLegend);

  const lineText = svgEl("text", {
    x: margin.left + 34,
    y: 20,
    fill: "#3c4a60",
    "font-size": 12,
  });
  lineText.textContent = "毎月の取崩額";
  legend.appendChild(lineText);

  const barLegend = svgEl("rect", {
    x: margin.left + 158,
    y: 12,
    width: 16,
    height: 8,
    fill: "#D2DDE9",
    stroke: "#B7BEC2",
    "stroke-width": 0.75,
  });
  legend.appendChild(barLegend);

  const barText = svgEl("text", {
    x: margin.left + 180,
    y: 20,
    fill: "#3c4a60",
    "font-size": 12,
  });
  barText.textContent = "資産残高";
  legend.appendChild(barText);

  w.chart.appendChild(legend);
}

function renderWithdraw() {
  const principal = isLinked ? latestFinalBalance : Number(w.principal.value);
  const annualRate = Number(w.rate.value);
  const withdrawalRate = Number(w.withdrawal.value);

  w.principalValue.value = formatCurrency(principal);
  w.rateValue.value = formatPercent(annualRate);
  w.withdrawalValue.value = formatPercent(withdrawalRate);

  const { points, bars } = buildWithdrawalSeries(principal, annualRate, withdrawalRate);
  const finalBalance = points[points.length - 1].y;
  w.finalBalance.textContent = formatCurrency(finalBalance);

  latestWithdrawalInitial = bars[0] ?? 0;
  w.withdrawalInitial.textContent = formatCurrency(latestWithdrawalInitial);
  w.withdrawal20y.textContent = formatCurrency(bars[20 * 12 - 1] ?? 0);
  w.withdrawal40y.textContent = formatCurrency(bars[bars.length - 1] ?? 0);

  drawWithdrawChart({ points, bars });

  renderTotal();
  syncShareUrl();
}

[w.rate, w.withdrawal].forEach((input) => {
  input.addEventListener("input", renderWithdraw);
});

w.principal.addEventListener("input", () => {
  if (!isLinked) {
    renderWithdraw();
  }
});

// =====================================================================
// フェーズ間の連携ロジック: 積立の最終残高 → 取崩の元本
// =====================================================================

function syncLinkedPrincipal() {
  const min = Number(w.principal.min);
  const max = Number(w.principal.max);
  // スライダーのつまみ位置は表示上の目安として範囲内にクランプするが、
  // 実際の計算には latestFinalBalance をそのまま使用する。
  w.principal.value = Math.min(Math.max(latestFinalBalance, min), max);
  renderWithdraw();
}

function setLinked(linked) {
  isLinked = linked;
  w.principal.disabled = linked;
  linkedReadout.classList.toggle("active", linked);

  if (linked) {
    syncLinkedPrincipal();
  } else {
    renderWithdraw();
  }
}

linkToggle.addEventListener("change", () => setLinked(linkToggle.checked));

// =====================================================================
// Stage 3: 年金受給シミュレーション
// =====================================================================

const pensionDefaults = {
  avgIncome: 5000000,
  yearsNational: 40,
  yearsKosei: 40,
  startAge1: 65,
  startAge2: 60,
  returnRate: 5,
};

const pensionState = { ...pensionDefaults };

const p = {
  avgIncome: document.getElementById("p-avgIncome"),
  yearsNational: document.getElementById("p-yearsNational"),
  yearsKosei: document.getElementById("p-yearsKosei"),
  startAge1: document.getElementById("p-startAge1"),
  startAge2: document.getElementById("p-startAge2"),
  returnRate: document.getElementById("p-returnRate"),
  avgIncomeValue: document.getElementById("p-avgIncomeValue"),
  yearsNationalValue: document.getElementById("p-yearsNationalValue"),
  yearsKoseiValue: document.getElementById("p-yearsKoseiValue"),
  startAge1Value: document.getElementById("p-startAge1Value"),
  startAge2Value: document.getElementById("p-startAge2Value"),
  returnRateValue: document.getElementById("p-returnRateValue"),
  monthly1Age: document.getElementById("p-monthly1Age"),
  monthly2Age: document.getElementById("p-monthly2Age"),
  monthly1: document.getElementById("p-monthly1"),
  monthly2: document.getElementById("p-monthly2"),
  breakevenText: document.getElementById("p-breakevenText"),
  investmentText: document.getElementById("p-investmentText"),
  chartCanvas: document.getElementById("p-chartCanvas"),
};

const pensionCtx = p.chartCanvas.getContext("2d");
const pensionGraphBounds = {
  left: 78,
  right: 810,
  top: 28,
  bottom: 378,
};
const pensionMinAge = 60;
const pensionMaxAge = 100;

// 年金フェーズの「開始年齢②」の月額受給額（最終統合結果に使用する生の数値）
let latestPensionMonthly2 = 0;

function updatePensionInputs() {
  p.avgIncome.value = pensionState.avgIncome;
  p.yearsNational.value = pensionState.yearsNational;
  p.yearsKosei.value = pensionState.yearsKosei;
  p.startAge1.value = pensionState.startAge1;
  p.startAge2.value = pensionState.startAge2;
  p.returnRate.value = pensionState.returnRate;

  p.avgIncomeValue.textContent = formatNumber(pensionState.avgIncome);
  p.yearsNationalValue.textContent = pensionState.yearsNational;
  p.yearsKoseiValue.textContent = pensionState.yearsKosei;
  p.startAge1Value.textContent = pensionState.startAge1;
  p.startAge2Value.textContent = pensionState.startAge2;
  p.returnRateValue.textContent = Number(pensionState.returnRate).toFixed(1);
}

function computeMonthlyPension(age) {
  const nationalFull = 65000;
  const nationalMonthly = nationalFull * (pensionState.yearsNational / 40);
  const employeeMonthly = (pensionState.avgIncome / 12) * 0.0056 * pensionState.yearsKosei;
  const baseMonthly = nationalMonthly + employeeMonthly;

  const ageOffset = age - 65;
  const coefficient = ageOffset >= 0 ? 1 + 0.084 * ageOffset : 1 + 0.048 * ageOffset;
  return Math.max(0, Math.round(baseMonthly * coefficient));
}

function buildInvestedSeries(startAge, monthly, annualRate) {
  const items = [];
  let balance = 0;
  const monthlyRate = annualRate / 100;
  for (let year = pensionMinAge; year <= pensionMaxAge; year += 1) {
    if (year >= startAge) {
      balance = balance * (1 + monthlyRate) + monthly * 12;
    } else {
      balance = balance * (1 + monthlyRate);
    }
    items.push({ age: year, value: balance });
  }
  return items;
}

function findBreakeven(seriesA, seriesB, startAge) {
  const startIndex = Math.max(1, startAge - pensionMinAge);
  for (let i = startIndex + 1; i < seriesA.length; i += 1) {
    const aPrev = seriesA[i - 1].value;
    const bPrev = seriesB[i - 1].value;
    const aCurr = seriesA[i].value;
    const bCurr = seriesB[i].value;
    const prevDelta = aPrev - bPrev;
    const currDelta = aCurr - bCurr;

    if (prevDelta === 0) {
      return seriesA[i - 1].age;
    }
    if (currDelta === 0) {
      return seriesA[i].age;
    }
    if ((prevDelta < 0 && currDelta > 0) || (prevDelta > 0 && currDelta < 0)) {
      const ageDiff = seriesA[i].age - seriesA[i - 1].age;
      const ratio = Math.abs(prevDelta) / (Math.abs(prevDelta) + Math.abs(currDelta));
      return Number((seriesA[i - 1].age + ageDiff * ratio).toFixed(1));
    }
  }
  return null;
}

function computePensionDerived() {
  const monthly1 = computeMonthlyPension(pensionState.startAge1);
  const monthly2 = computeMonthlyPension(pensionState.startAge2);
  const series1 = buildInvestedSeries(pensionState.startAge1, monthly1, pensionState.returnRate);
  const series2 = buildInvestedSeries(pensionState.startAge2, monthly2, pensionState.returnRate);
  const breakevenAge = findBreakeven(
    series1,
    series2,
    Math.max(pensionState.startAge1, pensionState.startAge2)
  );

  return { monthly1, monthly2, series1, series2, breakevenAge };
}

function updatePensionResults(derived) {
  const { monthly1, monthly2, series1, series2, breakevenAge } = derived;

  p.monthly1Age.textContent = `${pensionState.startAge1}歳`;
  p.monthly2Age.textContent = `${pensionState.startAge2}歳`;
  p.monthly1.textContent = formatNumber(monthly1);
  p.monthly2.textContent = formatNumber(monthly2);

  p.breakevenText.textContent =
    breakevenAge !== null
      ? `受給総額の損益分岐点はおよそ ${Math.round(breakevenAge)} 歳です。`
      : `${pensionMaxAge}歳までに損益分岐点が到達しませんでした。`;

  const totalAtMaxAge1 = Math.round(series1[series1.length - 1].value);
  const totalAtMaxAge2 = Math.round(series2[series2.length - 1].value);
  p.investmentText.textContent = `${pensionState.startAge1}歳開始の${pensionMaxAge}歳時点の運用累計は約 ${formatNumber(
    totalAtMaxAge1
  )} 円、${pensionState.startAge2}歳開始は約 ${formatNumber(totalAtMaxAge2)} 円です。`;
}

function formatPensionAxisValue(value) {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}億円`;
  }
  if (value >= 10000) {
    const amountInTenThousandYen = Math.round(value / 10000);
    return `${amountInTenThousandYen.toLocaleString("ja-JP")}万円`;
  }
  return `${Math.round(value)}円`;
}

function drawPensionAxis(maxValue) {
  pensionCtx.clearRect(0, 0, p.chartCanvas.width, p.chartCanvas.height);

  pensionCtx.fillStyle = "#ffffff";
  pensionCtx.fillRect(
    pensionGraphBounds.left,
    pensionGraphBounds.top,
    pensionGraphBounds.right - pensionGraphBounds.left,
    pensionGraphBounds.bottom - pensionGraphBounds.top
  );

  pensionCtx.strokeStyle = "rgba(36, 70, 111, 0.12)";
  pensionCtx.lineWidth = 1;

  for (let i = 0; i <= 4; i += 1) {
    const y = pensionGraphBounds.top + ((pensionGraphBounds.bottom - pensionGraphBounds.top) / 4) * i;
    pensionCtx.beginPath();
    pensionCtx.moveTo(pensionGraphBounds.left, y);
    pensionCtx.lineTo(pensionGraphBounds.right, y);
    pensionCtx.stroke();
  }

  for (let i = 0; i <= 4; i += 1) {
    const x = pensionGraphBounds.left + ((pensionGraphBounds.right - pensionGraphBounds.left) / 4) * i;
    pensionCtx.beginPath();
    pensionCtx.moveTo(x, pensionGraphBounds.top);
    pensionCtx.lineTo(x, pensionGraphBounds.bottom);
    pensionCtx.stroke();
  }

  pensionCtx.fillStyle = "#7b8aa3";
  pensionCtx.font = "13px sans-serif";
  pensionCtx.textAlign = "right";
  pensionCtx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const value = maxValue * (1 - i / 4);
    const y = pensionGraphBounds.top + ((pensionGraphBounds.bottom - pensionGraphBounds.top) / 4) * i;
    pensionCtx.fillText(formatPensionAxisValue(value), pensionGraphBounds.left - 12, y);
  }

  pensionCtx.textAlign = "center";
  pensionCtx.textBaseline = "top";
  for (let i = 0; i <= 4; i += 1) {
    const age = pensionMinAge + Math.round((pensionMaxAge - pensionMinAge) * (i / 4));
    const x = pensionGraphBounds.left + ((pensionGraphBounds.right - pensionGraphBounds.left) / 4) * i;
    pensionCtx.fillText(`${age}歳`, x, pensionGraphBounds.bottom + 12);
  }
}

function drawPensionSeries(series, color, options = {}) {
  pensionCtx.strokeStyle = color;
  pensionCtx.lineWidth = options.lineWidth ?? 3;
  pensionCtx.setLineDash(options.dash ?? []);
  pensionCtx.beginPath();

  series.forEach((point, index) => {
    const x =
      pensionGraphBounds.left +
      (pensionGraphBounds.right - pensionGraphBounds.left) * (index / (series.length - 1));
    const y =
      pensionGraphBounds.bottom -
      (pensionGraphBounds.bottom - pensionGraphBounds.top) * (point.value / options.maxValue);
    if (index === 0) {
      pensionCtx.moveTo(x, y);
    } else {
      pensionCtx.lineTo(x, y);
    }
  });
  pensionCtx.stroke();
  pensionCtx.setLineDash([]);
}

function updatePensionGraph(derived) {
  const { series1, series2 } = derived;
  const maxValue = Math.max(series1[series1.length - 1].value, series2[series2.length - 1].value, 1000000);

  drawPensionAxis(maxValue);
  drawPensionSeries(series1, "#336485", { maxValue, lineWidth: 3 });
  drawPensionSeries(series2, "#d97706", { maxValue, lineWidth: 3 });
}

function renderPension() {
  const derived = computePensionDerived();
  updatePensionResults(derived);
  updatePensionGraph(derived);

  latestPensionMonthly2 = derived.monthly2;

  renderTotal();
  syncShareUrl();
}

function handlePensionInputChange(event) {
  const key = event.target.id.replace("p-", "");
  pensionState[key] = Number(event.target.value);
  updatePensionInputs();
  renderPension();
}

[p.avgIncome, p.yearsNational, p.yearsKosei, p.startAge1, p.startAge2, p.returnRate].forEach((input) => {
  input.addEventListener("input", handlePensionInputChange);
  input.addEventListener("change", handlePensionInputChange);
});

// =====================================================================
// Stage 4: 統合結果（定率取崩の毎月の取崩額 + 年金月額②）
// =====================================================================

const totalWithdrawalEl = document.getElementById("total-withdrawal");
const totalPensionEl = document.getElementById("total-pension");
const totalPensionAgeEl = document.getElementById("total-pension-age");
const totalResultEl = document.getElementById("total-result");

function renderTotal() {
  const total = latestWithdrawalInitial + latestPensionMonthly2;

  totalWithdrawalEl.textContent = formatCurrency(latestWithdrawalInitial);
  totalPensionEl.textContent = formatCurrency(latestPensionMonthly2);
  totalPensionAgeEl.textContent = pensionState.startAge2;
  totalResultEl.textContent = formatCurrency(total);
}

// =====================================================================
// 共有リンク: 現在の設定をURLクエリパラメータに保存し、コピーする
// =====================================================================

function parseQueryState() {
  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length === 0) {
    return null;
  }

  const readParam = (key, input) =>
    clamp(Number(params.get(key) ?? input.value), Number(input.min), Number(input.max));

  return {
    principal: readParam("principal", a.principal),
    monthly: readParam("monthly", a.monthly),
    rate: readParam("rate", a.rate),
    years: readParam("years", a.years),
    wPrincipal: readParam("wprincipal", w.principal),
    wRate: readParam("wrate", w.rate),
    wWithdrawal: readParam("wwithdrawal", w.withdrawal),
    linked: params.has("linked") ? params.get("linked") !== "0" : isLinked,
    pension: {
      avgIncome: clamp(Number(params.get("avgIncome") ?? pensionDefaults.avgIncome), 0, 20000000),
      yearsNational: clamp(Number(params.get("yearsNational") ?? pensionDefaults.yearsNational), 0, 40),
      yearsKosei: clamp(Number(params.get("yearsKosei") ?? pensionDefaults.yearsKosei), 0, 50),
      startAge1: clamp(Number(params.get("startAge1") ?? pensionDefaults.startAge1), 60, 75),
      startAge2: clamp(Number(params.get("startAge2") ?? pensionDefaults.startAge2), 60, 75),
      returnRate: clamp(Number(params.get("returnRate") ?? pensionDefaults.returnRate), 0, 20),
    },
  };
}

function applyParsedState(parsed) {
  if (!parsed) {
    return;
  }

  a.principal.value = parsed.principal;
  a.monthly.value = parsed.monthly;
  a.rate.value = parsed.rate;
  a.years.value = parsed.years;
  w.principal.value = parsed.wPrincipal;
  w.rate.value = parsed.wRate;
  w.withdrawal.value = parsed.wWithdrawal;
  linkToggle.checked = parsed.linked;
  isLinked = parsed.linked;

  Object.assign(pensionState, parsed.pension);
}

function syncShareUrl() {
  const params = new URLSearchParams({
    principal: a.principal.value,
    monthly: a.monthly.value,
    rate: a.rate.value,
    years: a.years.value,
    wprincipal: w.principal.value,
    wrate: w.rate.value,
    wwithdrawal: w.withdrawal.value,
    linked: isLinked ? "1" : "0",
    avgIncome: pensionState.avgIncome,
    yearsNational: pensionState.yearsNational,
    yearsKosei: pensionState.yearsKosei,
    startAge1: pensionState.startAge1,
    startAge2: pensionState.startAge2,
    returnRate: pensionState.returnRate,
  });
  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", url);
}

function copyLink() {
  const shareUrl = window.location.href;
  navigator.clipboard
    .writeText(shareUrl)
    .then(() => {
      copyLinkBtn.textContent = "リンクをコピーしました";
      setTimeout(() => {
        copyLinkBtn.textContent = "共有リンクをコピー";
      }, 1800);
    })
    .catch(() => {
      alert("共有リンクのコピーに失敗しました。URLを手動でコピーしてください。");
    });
}

copyLinkBtn.addEventListener("click", copyLink);

// =====================================================================
// 初期描画
// =====================================================================

// URLにクエリパラメータがあれば、それを初期状態として各入力に反映する。
applyParsedState(parseQueryState());

// 連携の初期表示（disabled属性・注記の表示）を先に整えてから、
// 積立側の初回計算を行う。renderAccumulate は連携中なら取崩側の
// 計算・描画も内部で行うので、連携OFFで始まる場合だけここで補う
// （どちらの場合も renderWithdraw は1回しか呼ばれない）。
w.principal.disabled = isLinked;
linkedReadout.classList.toggle("active", isLinked);
renderAccumulate();
if (!isLinked) {
  renderWithdraw();
}

updatePensionInputs();
renderPension();

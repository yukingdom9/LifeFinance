// =====================================================================
// 共通ユーティリティ
// =====================================================================

const byId = (id) => document.getElementById(id);

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

// ---------------------------------------------------------------------
// SVGチャート共通の描画パーツ（積立チャート・取崩チャート・年金チャートの3つで使用）
// ---------------------------------------------------------------------

const CHART_WIDTH = 760;
const CHART_HEIGHT = 420;

// エリアグラフの塗り色。半透明にしてグリッド線が透けて見えるようにしつつ、
// 白背景に乗せたときの見た目の色合いは元の #D2DDE9（不透明）と同じになるよう
// 逆算した濃いめの色を、低い opacity で重ねている。
const AREA_FILL_COLOR = "#4B77A7";
const AREA_FILL_OPACITY = 0.25;

// 背景と、グラフ本体の白いプロットエリアを描画する（svgの中身は毎回描き直すため一旦クリアする）。
function drawChartFrame(svg, width, height, margin, plotWidth, plotHeight) {
  svg.innerHTML = "";
  svg.appendChild(svgEl("rect", { x: 0, y: 0, width, height, fill: "#f4f6fb", rx: 20 }));
  svg.appendChild(
    svgEl("rect", {
      x: margin.left,
      y: margin.top,
      width: plotWidth,
      height: plotHeight,
      fill: "#ffffff",
      stroke: "#dbe2ec",
    })
  );
}

// X軸・Y軸の枠線を描画する。
function drawChartAxisLines(svg, width, height, margin) {
  svg.appendChild(
    svgEl("line", {
      x1: margin.left,
      y1: height - margin.bottom,
      x2: width - margin.right,
      y2: height - margin.bottom,
      stroke: "#a9b7cc",
    })
  );
  svg.appendChild(
    svgEl("line", {
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: height - margin.bottom,
      stroke: "#a9b7cc",
    })
  );
}

// 横方向のグリッド線＋左端のY軸ラベルを描画する（積立・取崩・年金の3チャート共通）。
// ticksは常に [0, 0.25, 0.5, 0.75, 1] 割合の5点という前提。
function drawHorizontalGridlines(
  svg,
  { ticks, margin, width, plotHeight, formatLabel, labelColor = "#7b8aa3", labelOffsetX = -12 }
) {
  ticks.forEach((tickValue, index) => {
    const y = margin.top + plotHeight * (1 - index / 4);
    svg.appendChild(
      svgEl("line", {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        stroke: "rgba(36,70,111,0.12)",
      })
    );
    const label = svgEl("text", {
      x: margin.left + labelOffsetX,
      y: y + 4,
      fill: labelColor,
      "font-size": 12,
      "text-anchor": "end",
    });
    label.textContent = formatLabel(tickValue);
    svg.appendChild(label);
  });
}

// 右側のY軸ラベルのみを描画する（取崩チャートの第2軸＝資産残高用。グリッド線は左軸のみでよい）。
function drawRightAxisLabels(svg, { ticks, margin, width, plotHeight, formatLabel }) {
  ticks.forEach((tickValue, index) => {
    const y = margin.top + plotHeight * (1 - index / 4);
    const label = svgEl("text", {
      x: width - margin.right + 10,
      y: y + 4,
      fill: "#7b8aa3",
      "font-size": 12,
      "text-anchor": "start",
    });
    label.textContent = formatLabel(tickValue);
    svg.appendChild(label);
  });
}

// X軸下のラベル（「◯年」「◯歳」など）を、だいたい4〜5個になる間隔で描画する。
function drawChartXAxisLabels(svg, { height, margin, plotWidth, minValue = 0, maxValue, suffix }) {
  const range = maxValue - minValue;
  const step = Math.max(1, Math.round(range / 4));
  for (let value = minValue; value <= maxValue; value += step) {
    const x = margin.left + ((value - minValue) / range) * plotWidth;
    const label = svgEl("text", {
      x,
      y: height - margin.bottom + 24,
      fill: "#7b8aa3",
      "font-size": 12,
      "text-anchor": "middle",
    });
    label.textContent = `${value}${suffix}`;
    svg.appendChild(label);
  }
}

// 折れ線・輪郭線用のpath dataを組み立てる（"M x y L x y L x y ..."）。
function buildPathData(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

// 塗りつぶしエリア（資産残高など）を、薄い輪郭線つきで描画する（積立・取崩チャート共通）。
function drawFilledArea(svg, points, baselineY) {
  const areaData = [
    `M${points[0].x.toFixed(2)} ${baselineY.toFixed(2)}`,
    ...points.map((point) => `L${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    `L${points[points.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)}`,
    "Z",
  ].join(" ");
  svg.appendChild(svgEl("path", { d: areaData, fill: AREA_FILL_COLOR, opacity: AREA_FILL_OPACITY }));

  svg.appendChild(
    svgEl("path", {
      d: buildPathData(points),
      fill: "none",
      stroke: "#B7BEC2",
      "stroke-width": 0.75,
      "stroke-linejoin": "round",
    })
  );
}

// 太めの折れ線（取崩額の推移、年金の運用累計など）を描画する。
function drawLinePath(svg, points, stroke, strokeWidth) {
  svg.appendChild(
    svgEl("path", {
      d: buildPathData(points),
      fill: "none",
      stroke,
      "stroke-width": strokeWidth,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    })
  );
}

// =====================================================================
// DOM参照と、フェーズ間で共有する状態
// =====================================================================

const accumulateEls = {
  principal: byId("a-principal"),
  monthly: byId("a-monthly"),
  rate: byId("a-rate"),
  years: byId("a-years"),

  principalValue: byId("a-principal-value"),
  monthlyValue: byId("a-monthly-value"),
  rateValue: byId("a-rate-value"),
  yearsValue: byId("a-years-value"),

  finalBalance: byId("a-final-balance"),
  totalContribution: byId("a-total-contribution"),
  profit: byId("a-profit"),
  chart: byId("accumulate-chart"),
};

const withdrawEls = {
  principal: byId("w-principal"),
  rate: byId("w-rate"),
  withdrawal: byId("w-withdrawal"),
  fixedWithdrawal: byId("w-fixed-withdrawal"),
  fixedInflation: byId("w-fixed-inflation"),
  dynamicFixed: byId("w-dynamic-fixed"),
  dynamicInflation: byId("w-dynamic-inflation"),
  dynamicRate: byId("w-dynamic-rate"),

  principalValue: byId("w-principal-value"),
  rateValue: byId("w-rate-value"),
  withdrawalValue: byId("w-withdrawal-value"),
  fixedWithdrawalValue: byId("w-fixed-withdrawal-value"),
  fixedInflationValue: byId("w-fixed-inflation-value"),
  dynamicFixedValue: byId("w-dynamic-fixed-value"),
  dynamicInflationValue: byId("w-dynamic-inflation-value"),
  dynamicRateValue: byId("w-dynamic-rate-value"),

  finalBalance: byId("w-final-balance"),
  withdrawalInitial: byId("w-withdrawal-initial"),
  withdrawal10y: byId("w-withdrawal-10y"),
  withdrawal20y: byId("w-withdrawal-20y"),
  withdrawal30y: byId("w-withdrawal-30y"),
  cumulative10y: byId("w-cumulative-10y"),
  cumulative20y: byId("w-cumulative-20y"),
  cumulative30y: byId("w-cumulative-30y"),
  depletion: byId("w-depletion"),
  chart: byId("withdraw-chart"),

  rateModeControl: byId("rate-mode-control"),
  fixedModeControl: byId("fixed-mode-control"),
  dynamicModeControl: byId("dynamic-mode-control"),
  cardTrend: byId("w-card-trend"),
  cardCumulative: byId("w-card-cumulative"),
  cardDepletion: byId("w-card-depletion"),
};

const modeRateBtn = byId("mode-rate-btn");
const modeFixedBtn = byId("mode-fixed-btn");
const modeDynamicBtn = byId("mode-dynamic-btn");
const modeToggleIndicator = byId("mode-toggle-indicator");
const totalWithdrawalLabel = byId("total-withdrawal-label");

const linkToggle = byId("link-toggle");
const linkedReadout = byId("linked-readout");
const connectorFinalBalance = byId("connector-final-balance");
const copyLinkBtn = byId("copyLinkBtn");

// 積立フェーズの最終残高（連携ONのときに取崩フェーズの元本として使われる）
let latestFinalBalance = 0;
// 連携トグルの現在値
let isLinked = linkToggle.checked;
// 取崩フェーズの方式: "rate"（定率取崩）| "fixed"（定額取崩）| "dynamic"（動的取崩）。初期値は定率。
let withdrawalMode = "rate";
// 取崩フェーズの「毎月の取崩額」（最終統合結果に使用する生の数値）
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
  const margin = { top: 24, right: 24, bottom: 48, left: 84 };
  const plotWidth = CHART_WIDTH - margin.left - margin.right;
  const plotHeight = CHART_HEIGHT - margin.top - margin.bottom;

  const maxValue = getNiceMax(Math.max(...balances, 1) * 1.1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxValue * t);

  drawChartFrame(accumulateEls.chart, CHART_WIDTH, CHART_HEIGHT, margin, plotWidth, plotHeight);
  drawHorizontalGridlines(accumulateEls.chart, {
    ticks,
    margin,
    width: CHART_WIDTH,
    plotHeight,
    formatLabel: formatPrincipalAxis,
  });
  drawChartAxisLines(accumulateEls.chart, CHART_WIDTH, CHART_HEIGHT, margin);

  const linePoints = balances.map((value, index) => {
    const x = margin.left + (index / (balances.length - 1)) * plotWidth;
    const y = margin.top + plotHeight * (1 - Math.max(0, value) / maxValue);
    return { x, y };
  });

  // 取崩フェーズの資産残高エリアと同じ見た目（塗り＋薄い輪郭線のみ、太い線は引かない）にする。
  const baselineY = margin.top + plotHeight;
  drawFilledArea(accumulateEls.chart, linePoints, baselineY);

  drawChartXAxisLabels(accumulateEls.chart, { height: CHART_HEIGHT, margin, plotWidth, maxValue: years, suffix: "年" });
}

function renderAccumulate() {
  const principal = Number(accumulateEls.principal.value);
  const monthly = Number(accumulateEls.monthly.value);
  const annualRate = Number(accumulateEls.rate.value);
  const years = Number(accumulateEls.years.value);

  accumulateEls.principalValue.value = formatCurrency(principal);
  accumulateEls.monthlyValue.value = formatCurrency(monthly);
  accumulateEls.rateValue.value = formatPercent(annualRate);
  accumulateEls.yearsValue.value = `${years}年`;

  const projection = getProjection(principal, monthly, annualRate, years);

  accumulateEls.finalBalance.textContent = formatCurrency(projection.finalBalance);
  accumulateEls.totalContribution.textContent = formatCurrency(projection.totalContribution);
  accumulateEls.profit.textContent = formatCurrency(projection.profit);

  drawAccumulateChart(projection.balances, years);

  latestFinalBalance = projection.finalBalance;
  connectorFinalBalance.textContent = formatCurrency(latestFinalBalance);

  if (isLinked) {
    syncLinkedPrincipal();
  }

  syncShareUrl();
}

[accumulateEls.principal, accumulateEls.monthly, accumulateEls.rate, accumulateEls.years].forEach((input) => {
  input.addEventListener("input", renderAccumulate);
});

// =====================================================================
// Stage 2: 取崩シミュレーション（定率取崩 / 定額取崩 / 動的取崩）
// =====================================================================

// 定率取崩・定額取崩に共通する40年間の月次シミュレーション。
// getWithdrawal は毎月の希望取崩額を返すコールバックで、方式ごとの違いを吸収する。
// 実際の取崩額は「その月の運用後残高」を上限にクランプされる（残高以上は取り崩せない）。
function simulateWithdrawal({ principal, annualRate, months, getWithdrawal }) {
  const monthlyRate = annualRate / 100 / 12;
  const points = [{ x: 0, y: principal }];
  const bars = [];
  let balance = principal;
  let depletionMonth = null;

  for (let month = 1; month <= months; month += 1) {
    const preGrowthBalance = balance;
    const grownBalance = balance * (1 + monthlyRate);
    const requestedWithdrawal = getWithdrawal({ preGrowthBalance, grownBalance, month });
    const actualWithdrawal = Math.max(0, Math.min(requestedWithdrawal, grownBalance));

    balance = grownBalance - actualWithdrawal;
    bars.push(actualWithdrawal);

    if (balance <= 0) {
      balance = 0;
      if (depletionMonth === null && actualWithdrawal > 0) {
        depletionMonth = month;
      }
    }

    points.push({ x: month / 12, y: balance });
  }

  return { points, bars, depletionMonth };
}

function buildWithdrawalSeries(principal, annualRate, withdrawalRate) {
  return simulateWithdrawal({
    principal,
    annualRate,
    months: 40 * 12,
    // 取崩率方式: 毎月、運用前の残高に対して一定割合を取り崩す。
    getWithdrawal: ({ preGrowthBalance }) => (preGrowthBalance * (withdrawalRate / 100)) / 12,
  });
}

// 指定した基準額に、インフレ率を毎月複利で反映した「その月時点の額」を返す。
// month=1（初月）はインフレ反映前の基準額そのものになるよう (month - 1) 乗にしている。
function applyInflation(baseAmount, inflationRate, month) {
  const monthlyInflationFactor = 1 + inflationRate / 100 / 12;
  return baseAmount * monthlyInflationFactor ** (month - 1);
}

function buildFixedWithdrawalSeries(principal, annualRate, monthlyWithdrawal, inflationRate) {
  return simulateWithdrawal({
    principal,
    annualRate,
    months: 40 * 12,
    // 定額方式: 毎月、残高に関わらず一定額を取り崩そうとする。
    // インフレ率が設定されている場合、取崩額は毎年インフレ率分だけ増えていく。
    getWithdrawal: ({ month }) => applyInflation(monthlyWithdrawal, inflationRate, month),
  });
}

// 動的取崩（定額＋定率のハイブリッド）: 生活費の不足分など「必ず確保したい額」を
// 年金補充額（定額）で取り崩しつつ、それとは別に残高に応じた「ゆとり分」を取崩率（余剰）で
// 取り崩す。両者は独立したスライダーで指定し、毎月その合計額を取り崩す。
// 年金補充額部分は、インフレ率に応じて毎年増えていく（余剰の取崩率には影響しない）。
function buildDynamicWithdrawalSeries(principal, annualRate, fixedWithdrawal, inflationRate, surplusRate) {
  return simulateWithdrawal({
    principal,
    annualRate,
    months: 40 * 12,
    getWithdrawal: ({ preGrowthBalance, month }) =>
      applyInflation(fixedWithdrawal, inflationRate, month) + (preGrowthBalance * (surplusRate / 100)) / 12,
  });
}

// 取崩モードごとの設定を1箇所に集約したもの。renderWithdraw / setWithdrawalMode /
// 共有URLの復元は、いずれもここを見て動作を切り替える。
// モードを追加したいときは、対応するUI要素を用意したうえでここに1エントリ足すだけでよい。
const withdrawalModeConfigs = {
  rate: {
    button: modeRateBtn,
    control: withdrawEls.rateModeControl,
    totalLabel: "毎月の取崩額（定率取崩）",
    showTrendCards: true, // 取崩額が変動するため、10年後/20年後/30年後の推移カードを表示
    showDepletionCard: false,
    compute(principal, annualRate) {
      const withdrawalRate = Number(withdrawEls.withdrawal.value);
      withdrawEls.withdrawalValue.value = formatPercent(withdrawalRate);
      return buildWithdrawalSeries(principal, annualRate, withdrawalRate);
    },
  },
  fixed: {
    button: modeFixedBtn,
    control: withdrawEls.fixedModeControl,
    totalLabel: "毎月の取崩額（定額取崩）",
    showTrendCards: true, // 定率取崩と同じ3項目（毎月/推移/最終残高）で表示を揃える
    showDepletionCard: false,
    compute(principal, annualRate) {
      const monthlyWithdrawal = Number(withdrawEls.fixedWithdrawal.value);
      const inflationRate = Number(withdrawEls.fixedInflation.value);
      withdrawEls.fixedWithdrawalValue.value = formatCurrency(monthlyWithdrawal);
      withdrawEls.fixedInflationValue.value = formatPercent(inflationRate);
      return buildFixedWithdrawalSeries(principal, annualRate, monthlyWithdrawal, inflationRate);
    },
  },
  dynamic: {
    button: modeDynamicBtn,
    control: withdrawEls.dynamicModeControl,
    totalLabel: "毎月の取崩額（動的取崩）",
    // 定率取崩と同じ3項目（毎月/推移/最終残高）で表示を揃える
    showTrendCards: true,
    showDepletionCard: false,
    compute(principal, annualRate) {
      const fixedWithdrawal = Number(withdrawEls.dynamicFixed.value);
      const inflationRate = Number(withdrawEls.dynamicInflation.value);
      const surplusRate = Number(withdrawEls.dynamicRate.value);
      withdrawEls.dynamicFixedValue.value = formatCurrency(fixedWithdrawal);
      withdrawEls.dynamicInflationValue.value = formatPercent(inflationRate);
      withdrawEls.dynamicRateValue.value = formatPercent(surplusRate);
      return buildDynamicWithdrawalSeries(principal, annualRate, fixedWithdrawal, inflationRate, surplusRate);
    },
  },
};

function drawWithdrawChart(series) {
  const margin = { top: 24, right: 80, bottom: 48, left: 72 };
  const plotWidth = CHART_WIDTH - margin.left - margin.right;
  const plotHeight = CHART_HEIGHT - margin.top - margin.bottom;
  const months = series.bars.length;

  const maxLeft = getNiceMax(Math.max(...series.bars, 1) * 1.1);
  const maxRight = getNiceMax(Math.max(...series.points.map((point) => point.y), 1) * 1.1);
  const leftTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxLeft * t);
  const rightTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxRight * t);

  drawChartFrame(withdrawEls.chart, CHART_WIDTH, CHART_HEIGHT, margin, plotWidth, plotHeight);

  drawHorizontalGridlines(withdrawEls.chart, {
    ticks: leftTicks,
    margin,
    width: CHART_WIDTH,
    plotHeight,
    formatLabel: formatWithdrawAxis,
    labelColor: "#336485",
    labelOffsetX: -10,
  });
  drawRightAxisLabels(withdrawEls.chart, {
    ticks: rightTicks,
    margin,
    width: CHART_WIDTH,
    plotHeight,
    formatLabel: formatPrincipalAxis,
  });

  drawChartAxisLines(withdrawEls.chart, CHART_WIDTH, CHART_HEIGHT, margin);

  const baselineY = margin.top + plotHeight;
  const balancePoints = series.points.map((point) => {
    const x = margin.left + (point.x / 40) * plotWidth;
    const y = margin.top + plotHeight * (1 - Math.max(0, point.y) / maxRight);
    return { x, y };
  });
  drawFilledArea(withdrawEls.chart, balancePoints, baselineY);

  const withdrawalLinePoints = series.bars.map((value, index) => {
    const x = margin.left + (index / months) * plotWidth;
    const y = margin.top + plotHeight * (1 - Math.max(0, Math.min(maxLeft, value)) / maxLeft);
    return { x, y };
  });
  drawLinePath(withdrawEls.chart, withdrawalLinePoints, "#d97706", 3.5);

  drawChartXAxisLabels(withdrawEls.chart, { height: CHART_HEIGHT, margin, plotWidth, maxValue: 40, suffix: "年" });
}

// 「資産が尽きる時期」カードの表示文言を組み立てる。
function formatDepletionText(depletionMonth) {
  if (depletionMonth == null) {
    return "40年以内に枯渇なし";
  }
  const years = Math.floor(depletionMonth / 12);
  const months = depletionMonth % 12;
  return `${years}年${months}か月`;
}

// 「取崩額の推移」カード: 10年後/20年後/30年後の毎月の取崩額（単月の額）を表示する。
function updateWithdrawTrendCards(bars) {
  withdrawEls.withdrawal10y.textContent = formatCurrency(bars[10 * 12 - 1] ?? 0);
  withdrawEls.withdrawal20y.textContent = formatCurrency(bars[20 * 12 - 1] ?? 0);
  withdrawEls.withdrawal30y.textContent = formatCurrency(bars[30 * 12 - 1] ?? 0);
}

// 累計和の配列を1回のループで作る（10年後/20年後/30年後をそれぞれ0から合計し直さないための最適化）。
// bars.slice(0, n).reduce((t, v) => t + v, 0) を3回行うのと、加算の順序・結果は完全に同じ。
function buildCumulativeSums(values) {
  const cumulative = [];
  let runningTotal = 0;
  for (let i = 0; i < values.length; i += 1) {
    runningTotal += values[i];
    cumulative.push(runningTotal);
  }
  return cumulative;
}

// 「累計取崩額」カード: 開始から10年後/20年後/30年後までに取り崩した額の合計を表示する。
function updateWithdrawCumulativeCards(bars) {
  const cumulativeBars = buildCumulativeSums(bars);
  withdrawEls.cumulative10y.textContent = formatCurrency(cumulativeBars[10 * 12 - 1] ?? 0);
  withdrawEls.cumulative20y.textContent = formatCurrency(cumulativeBars[20 * 12 - 1] ?? 0);
  withdrawEls.cumulative30y.textContent = formatCurrency(cumulativeBars[30 * 12 - 1] ?? 0);
}

function updateWithdrawSummaryCards(activeConfig, { points, bars, depletionMonth }) {
  const finalBalance = points[points.length - 1].y;
  withdrawEls.finalBalance.textContent = formatCurrency(finalBalance);

  latestWithdrawalInitial = bars[0] ?? 0;
  withdrawEls.withdrawalInitial.textContent = formatCurrency(latestWithdrawalInitial);

  if (activeConfig.showDepletionCard) {
    withdrawEls.depletion.textContent = formatDepletionText(depletionMonth);
  }

  if (activeConfig.showTrendCards) {
    updateWithdrawTrendCards(bars);
    updateWithdrawCumulativeCards(bars);
  }
}

function renderWithdraw() {
  const principal = isLinked ? latestFinalBalance : Number(withdrawEls.principal.value);
  const annualRate = Number(withdrawEls.rate.value);

  withdrawEls.principalValue.value = formatCurrency(principal);
  withdrawEls.rateValue.value = formatPercent(annualRate);

  const activeConfig = withdrawalModeConfigs[withdrawalMode];
  const series = activeConfig.compute(principal, annualRate);

  updateWithdrawSummaryCards(activeConfig, series);
  drawWithdrawChart(series);

  renderTotal();
  syncShareUrl();
}

[
  withdrawEls.rate,
  withdrawEls.withdrawal,
  withdrawEls.fixedWithdrawal,
  withdrawEls.dynamicFixed,
  withdrawEls.dynamicRate,
].forEach((input) => {
  input.addEventListener("input", renderWithdraw);
});

// 定額取崩・動的取崩の想定インフレ率は同じ前提を共有するため、一方を動かすともう一方も連動する
[withdrawEls.fixedInflation, withdrawEls.dynamicInflation].forEach((input) => {
  input.addEventListener("input", () => {
    withdrawEls.fixedInflation.value = input.value;
    withdrawEls.dynamicInflation.value = input.value;
    renderWithdraw();
  });
});

withdrawEls.principal.addEventListener("input", () => {
  if (!isLinked) {
    renderWithdraw();
  }
});

// =====================================================================
// 取崩フェーズ: 定率取崩 / 定額取崩 / 動的取崩の切り替え
// =====================================================================

function positionModeToggleIndicator(instant = false) {
  const activeBtn = withdrawalModeConfigs[withdrawalMode].button;

  if (instant) {
    // 初期表示時はトランジションを一時的に無効化し、パッと出た状態にする。
    modeToggleIndicator.style.transition = "none";
  }

  modeToggleIndicator.style.width = `${activeBtn.offsetWidth}px`;
  modeToggleIndicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`;

  if (instant) {
    // 強制リフローで「transition: none」を確実に適用してから元に戻す。
    modeToggleIndicator.offsetHeight;
    modeToggleIndicator.style.transition = "";
  }
}

function setWithdrawalMode(mode, options = {}) {
  const { instant = false } = options;
  withdrawalMode = mode;

  Object.entries(withdrawalModeConfigs).forEach(([key, config]) => {
    const isActive = key === mode;
    config.button.classList.toggle("active", isActive);
    config.button.setAttribute("aria-pressed", String(isActive));
    config.control.classList.toggle("hidden", !isActive);
  });

  positionModeToggleIndicator(instant);

  const activeConfig = withdrawalModeConfigs[mode];
  withdrawEls.cardTrend.classList.toggle("hidden", !activeConfig.showTrendCards);
  withdrawEls.cardCumulative.classList.toggle("hidden", !activeConfig.showTrendCards);
  withdrawEls.cardDepletion.classList.toggle("hidden", !activeConfig.showDepletionCard);

  totalWithdrawalLabel.textContent = activeConfig.totalLabel;

  renderWithdraw();
}

Object.entries(withdrawalModeConfigs).forEach(([mode, config]) => {
  config.button.addEventListener("click", () => setWithdrawalMode(mode));
});
window.addEventListener("resize", () => positionModeToggleIndicator(true));

// =====================================================================
// フェーズ間の連携ロジック: 積立の最終残高 → 取崩の元本
// =====================================================================

function syncLinkedPrincipal() {
  const min = Number(withdrawEls.principal.min);
  const max = Number(withdrawEls.principal.max);
  // スライダーのつまみ位置は表示上の目安として範囲内にクランプするが、
  // 実際の計算には latestFinalBalance をそのまま使用する。
  withdrawEls.principal.value = Math.min(Math.max(latestFinalBalance, min), max);
  renderWithdraw();
}

function setLinked(linked) {
  isLinked = linked;
  withdrawEls.principal.disabled = linked;
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

const pensionEls = {
  avgIncome: byId("p-avgIncome"),
  yearsNational: byId("p-yearsNational"),
  yearsKosei: byId("p-yearsKosei"),
  startAge1: byId("p-startAge1"),
  startAge2: byId("p-startAge2"),
  returnRate: byId("p-returnRate"),
  avgIncomeValue: byId("p-avgIncomeValue"),
  yearsNationalValue: byId("p-yearsNationalValue"),
  yearsKoseiValue: byId("p-yearsKoseiValue"),
  startAge1Value: byId("p-startAge1Value"),
  startAge2Value: byId("p-startAge2Value"),
  returnRateValue: byId("p-returnRateValue"),
  monthly1Age: byId("p-monthly1Age"),
  monthly2Age: byId("p-monthly2Age"),
  monthly1: byId("p-monthly1"),
  monthly2: byId("p-monthly2"),
  breakevenText: byId("p-breakevenText"),
  investmentText: byId("p-investmentText"),
  chart: byId("pension-chart"),
};

const pensionMinAge = 60;
const pensionMaxAge = 100;

// 年金フェーズの「開始年齢②」の月額受給額（最終統合結果に使用する生の数値）
let latestPensionMonthly2 = 0;

function updatePensionInputs() {
  pensionEls.avgIncome.value = pensionState.avgIncome;
  pensionEls.yearsNational.value = pensionState.yearsNational;
  pensionEls.yearsKosei.value = pensionState.yearsKosei;
  pensionEls.startAge1.value = pensionState.startAge1;
  pensionEls.startAge2.value = pensionState.startAge2;
  pensionEls.returnRate.value = pensionState.returnRate;

  pensionEls.avgIncomeValue.textContent = formatCurrency(pensionState.avgIncome);
  pensionEls.yearsNationalValue.textContent = pensionState.yearsNational;
  pensionEls.yearsKoseiValue.textContent = pensionState.yearsKosei;
  pensionEls.startAge1Value.textContent = pensionState.startAge1;
  pensionEls.startAge2Value.textContent = pensionState.startAge2;
  pensionEls.returnRateValue.textContent = Number(pensionState.returnRate).toFixed(1);
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

  pensionEls.monthly1Age.textContent = `${pensionState.startAge1}歳`;
  pensionEls.monthly2Age.textContent = `${pensionState.startAge2}歳`;
  pensionEls.monthly1.textContent = formatCurrency(monthly1);
  pensionEls.monthly2.textContent = formatCurrency(monthly2);

  pensionEls.breakevenText.textContent =
    breakevenAge !== null
      ? `受給総額の損益分岐点はおよそ ${Math.round(breakevenAge)} 歳です。`
      : `${pensionMaxAge}歳までに損益分岐点が到達しませんでした。`;

  const totalAtMaxAge1 = Math.round(series1[series1.length - 1].value);
  const totalAtMaxAge2 = Math.round(series2[series2.length - 1].value);
  pensionEls.investmentText.textContent = `${pensionState.startAge1}歳開始の${pensionMaxAge}歳時点の運用累計は約 ${formatCurrency(
    totalAtMaxAge1
  )}、${pensionState.startAge2}歳開始は約 ${formatCurrency(totalAtMaxAge2)}です。`;
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

// 積立投資チャート（drawAccumulateChart）と同じ基本構造
// （白いプロットエリア＋横方向のグリッド線のみ、縦線なし）で描画する。
function drawPensionChart(series1, series2, maxValue) {
  const margin = { top: 24, right: 24, bottom: 48, left: 84 };
  const plotWidth = CHART_WIDTH - margin.left - margin.right;
  const plotHeight = CHART_HEIGHT - margin.top - margin.bottom;

  drawChartFrame(pensionEls.chart, CHART_WIDTH, CHART_HEIGHT, margin, plotWidth, plotHeight);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxValue * t);
  drawHorizontalGridlines(pensionEls.chart, {
    ticks,
    margin,
    width: CHART_WIDTH,
    plotHeight,
    formatLabel: formatPensionAxisValue,
  });

  drawChartAxisLines(pensionEls.chart, CHART_WIDTH, CHART_HEIGHT, margin);

  const ageRange = pensionMaxAge - pensionMinAge;
  const toPlotPoints = (series) =>
    series.map((point) => ({
      x: margin.left + ((point.age - pensionMinAge) / ageRange) * plotWidth,
      y: margin.top + plotHeight * (1 - Math.max(0, point.value) / maxValue),
    }));

  drawLinePath(pensionEls.chart, toPlotPoints(series1), "#336485", 3);
  drawLinePath(pensionEls.chart, toPlotPoints(series2), "#d97706", 3);

  drawChartXAxisLabels(pensionEls.chart, {
    height: CHART_HEIGHT,
    margin,
    plotWidth,
    minValue: pensionMinAge,
    maxValue: pensionMaxAge,
    suffix: "歳",
  });
}

function updatePensionGraph(derived) {
  const { series1, series2 } = derived;
  const maxValue = Math.max(series1[series1.length - 1].value, series2[series2.length - 1].value, 1000000);

  drawPensionChart(series1, series2, maxValue);
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

[
  pensionEls.avgIncome,
  pensionEls.yearsNational,
  pensionEls.yearsKosei,
  pensionEls.startAge1,
  pensionEls.startAge2,
  pensionEls.returnRate,
].forEach((input) => {
  input.addEventListener("input", handlePensionInputChange);
  input.addEventListener("change", handlePensionInputChange);
});

// =====================================================================
// Stage 4: 統合結果（取崩フェーズの毎月の取崩額 + 年金月額②）
// =====================================================================

const totalWithdrawalEl = byId("total-withdrawal");
const totalPensionEl = byId("total-pension");
const totalPensionAgeEl = byId("total-pension-age");
const totalResultEl = byId("total-result");

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

// URLに保存する「レンジスライダー」の入力欄の一覧。
// 新しいスライダーを共有リンク対応にしたいときは、ここに1行足すだけでよい
// （parse / apply / sync すべてにこの一覧が使われるため、更新漏れが起きない）。
const shareSliderFields = [
  { param: "principal", input: accumulateEls.principal },
  { param: "monthly", input: accumulateEls.monthly },
  { param: "rate", input: accumulateEls.rate },
  { param: "years", input: accumulateEls.years },
  { param: "wprincipal", input: withdrawEls.principal },
  { param: "wrate", input: withdrawEls.rate },
  { param: "wwithdrawal", input: withdrawEls.withdrawal },
  { param: "wfixedwithdrawal", input: withdrawEls.fixedWithdrawal },
  // 想定インフレ率は定額取崩・動的取崩で連動するため、URLパラメータは1つに集約する
  { param: "wfixedinflation", input: withdrawEls.fixedInflation },
  { param: "wdynamicfixed", input: withdrawEls.dynamicFixed },
  { param: "wdynamicrate", input: withdrawEls.dynamicRate },
];

function parseQueryState() {
  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length === 0) {
    return null;
  }

  const sliderValues = {};
  shareSliderFields.forEach(({ param, input }) => {
    sliderValues[param] = clamp(Number(params.get(param) ?? input.value), Number(input.min), Number(input.max));
  });

  return {
    sliderValues,
    wMode: params.get("wmode") in withdrawalModeConfigs ? params.get("wmode") : "rate",
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

  shareSliderFields.forEach(({ param, input }) => {
    input.value = parsed.sliderValues[param];
  });
  // 想定インフレ率（動的取崩）はURLに保存していないため、定額取崩側の値から復元する
  withdrawEls.dynamicInflation.value = withdrawEls.fixedInflation.value;
  withdrawalMode = parsed.wMode;
  linkToggle.checked = parsed.linked;
  isLinked = parsed.linked;

  Object.assign(pensionState, parsed.pension);
}

function syncShareUrl() {
  const params = new URLSearchParams();
  shareSliderFields.forEach(({ param, input }) => {
    params.set(param, input.value);
  });
  params.set("wmode", withdrawalMode);
  params.set("linked", isLinked ? "1" : "0");
  params.set("avgIncome", pensionState.avgIncome);
  params.set("yearsNational", pensionState.yearsNational);
  params.set("yearsKosei", pensionState.yearsKosei);
  params.set("startAge1", pensionState.startAge1);
  params.set("startAge2", pensionState.startAge2);
  params.set("returnRate", pensionState.returnRate);

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

// 連携の初期表示（disabled属性・注記の表示）と、取崩方式（定率/定額）の
// 初期表示を先に整えてから、積立側の初回計算を行う。renderAccumulate は
// 連携中なら取崩側の計算・描画も内部で行うので、連携OFFで始まる場合だけ
// ここで補う。
withdrawEls.principal.disabled = isLinked;
linkedReadout.classList.toggle("active", isLinked);
setWithdrawalMode(withdrawalMode, { instant: true });
renderAccumulate();
if (!isLinked) {
  renderWithdraw();
}

updatePensionInputs();
renderPension();

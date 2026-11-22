/**
 * Chart colours. They match `src/app/globals.css` where they overlap; the
 * ramp and the dark colours are the chart-only steps from the dashboards spec.
 */
export const CHART = {
  ramp: ["#f4f2fd", "#d9d1fa", "#b7aaff", "#8f7ef0", "#6d5ae6", "#3b2f8f"],
  violet: "#6d5ae6",
  lilac2: "#d9d1fa",
  gray: "#c9c7d4",
  grid: "#ecebf2",
  axis: "#67647a",
  dark: {
    surface: "#16141c",
    grid: "#2a2733",
    line: "#b7aaff",
    previous: "#5a5670",
    label: "#b9b6c9",
    better: "#6fe0b0",
    worse: "#ff9aa1",
  },
  status: { late: "#d0303a", collect: "#e0a33a" },
} as const;

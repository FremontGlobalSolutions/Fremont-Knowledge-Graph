export type GraphTheme = {
  textPrimary: string;
  textMuted: string;
  accentSecondary: string;
  accentPrimary: string;
  surfaceSecondary: string;
  warning: string;
  fileNode: string;
  crossRepo: string;
};

export const LIGHT_THEME: GraphTheme = {
  textPrimary: "#101828",
  textMuted: "#667085",
  accentSecondary: "#3fc7f9",
  accentPrimary: "#7a66f1",
  surfaceSecondary: "#edeff7",
  warning: "#b45309",
  fileNode: "#6ea8fe",
  crossRepo: "#db2777",
};

export const DARK_THEME: GraphTheme = {
  textPrimary: "#ffffff",
  textMuted: "rgba(255, 255, 255, 0.72)",
  accentSecondary: "#3fc7f9",
  accentPrimary: "#7a66f1",
  surfaceSecondary: "#070313",
  warning: "#fbbf24",
  fileNode: "#60a5fa",
  crossRepo: "#f472b6",
};

export function readGraphTheme(isDark: boolean): GraphTheme {
  return isDark ? DARK_THEME : LIGHT_THEME;
}

export const REPO_COLORS = [
  "#7a66f1",
  "#3fc7f9",
  "#34d399",
  "#f472b6",
  "#fb923c",
  "#a78bfa",
  "#38bdf8",
  "#4ade80",
  "#f87171",
  "#facc15",
  "#2dd4bf",
  "#c084fc",
];

export function repoColor(repo: string, repos: string[]): string {
  const index = repos.indexOf(repo);
  if (index < 0) return REPO_COLORS[0]!;
  return REPO_COLORS[index % REPO_COLORS.length]!;
}

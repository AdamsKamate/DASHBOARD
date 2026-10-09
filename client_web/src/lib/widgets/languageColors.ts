// The colour of a programming language.

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572a5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Dockerfile: "#384d54",
  Makefile: "#427819",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Java: "#b07219",
  Go: "#00add8",
  Rust: "#dea584",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Swift: "#f05138",
  Kotlin: "#a97bff",
  Dart: "#00b4ab",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Lua: "#000080",
  Perl: "#0298c3",
  Haskell: "#5e5086",
  "Jupyter Notebook": "#da5b0b",
  TeX: "#3d6117",
  PLpgSQL: "#336790",
  Procfile: "#a0a0a0",
};

/* The slice that stands for everything too small to show on its own */
const OTHER_LANGUAGES_NAME = "Autres";
const OTHER_LANGUAGES_COLOR = "#64748b";

/*
 A colour derived from the name itself
 */
function generatedColor(languageName: string): string {
  let hash = 0;
  for (let index = 0; index < languageName.length; index += 1) {
    hash = (hash * 31 + languageName.charCodeAt(index)) % 360;
  }
  return `hsl(${hash} 65% 55%)`;
}

export function languageColor(languageName: string): string {
  if (languageName === OTHER_LANGUAGES_NAME) {
    return OTHER_LANGUAGES_COLOR;
  }
  return LANGUAGE_COLORS[languageName] ?? generatedColor(languageName);
}

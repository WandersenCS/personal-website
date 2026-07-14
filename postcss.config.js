const path = require("path");
const fs = require("fs");
const postcssImport = require("postcss-import");
const postcssUrl = require("postcss-url");
const postcssNesting = require("postcss-nesting");
const postcssCustomMedia = require("postcss-custom-media");
const postcssPresetEnv = require("postcss-preset-env");
const cssnano = require("cssnano");
const purgeCSSPlugin = require("@fullhuman/postcss-purgecss");

module.exports = {
  plugins: [
    postcssImport({
      resolve: (id) => {
        const modulePath = path.join(__dirname, "node_modules", ...id.split("/"));

        if (fs.existsSync(modulePath) && fs.statSync(modulePath).isFile()) {
          return modulePath;
        }

        const moduleIndex = path.join(modulePath, "index.css");
        if (fs.existsSync(moduleIndex)) {
          return moduleIndex;
        }

        return id;
      },
      path: [
        path.join(__dirname, "assets", "css"),
        path.join(__dirname, "node_modules"),
      ],
    }),
    postcssUrl([
      {
        filter: "**/typeface-*/files/*",
        url: (asset) => path.posix.join("/", "fonts", path.basename(asset.pathname)),
      },
    ]),
    postcssNesting,
    postcssCustomMedia,
    ...(process.env.HUGO_ENVIRONMENT === "production"
      ? [
          postcssPresetEnv,
          cssnano,
          purgeCSSPlugin({
            content: ["./hugo_stats.json"],
            defaultExtractor: (content) => {
              const els = JSON.parse(content).htmlElements;
              return els.tags.concat(els.classes, els.ids);
            },
            safelist: [
              "data-theme",
              "cv-export-compact-entry-titles",
              "cv-export__row",
              "cv-export__status--warning",
              "cv-export-filtering",
              "cv-export-hidden",
              "cv-export-image-large",
              "cv-export-image-medium",
              "cv-export-image-small",
              "cv-export-measure",
              "cv-export-print-dark",
              "cv-export-print-light",
              "cv-export-print-main",
              "cv-export-print-page",
              "cv-export-print-profile",
              "cv-export-print-side",
              "cv-export-printing",
              "cv-export-profile-links-visible",
              "cv-export-profile-link",
              "cv-export__section",
              "cv-export__section--disabled",
              "cv-export__section--dragging",
              "cv-export__section--drop-after",
              "cv-export__section--drop-before",
              "cv-export__section-header",
              "cv-export__section-rows",
              "cv-export__section-title",
              "cv-export-target-one",
            ],
          }),
        ]
      : []),
  ],
};

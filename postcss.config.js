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
            safelist: ["data-theme"],
          }),
        ]
      : []),
  ],
};

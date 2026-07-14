# personal-website

Hugo site for https://wandersen.dev, based on `schnerring/hugo-theme-gruvbox`.

## Requirements

- Hugo Extended
- Go
- Node.js and npm
- Git

Check that the tools are available:

```powershell
hugo version
go version
node --version
npm --version
```

## Initial Setup

After cloning the repository, install the Hugo module and npm dependencies:

```powershell
hugo mod get
hugo mod npm pack
npm install
```

`hugo mod npm pack` generates Hugo module npm metadata used by the theme. Run it again after Hugo module changes.

## Local Preview

Start the local development server:

```powershell
hugo server --bind 127.0.0.1 --baseURL http://127.0.0.1:1313/
```

Open:

```text
http://127.0.0.1:1313/
```

## Production Build

Build the site the same way GitHub Pages does:

```powershell
hugo --gc --minify --environment production --baseURL "https://wandersen.dev/"
```

The generated site is written to `public/`.

## Updating Dependencies

Update the Hugo theme and JSON resume module:

```powershell
hugo mod get -u github.com/schnerring/hugo-theme-gruvbox github.com/schnerring/hugo-mod-json-resume
hugo mod tidy
hugo mod npm pack
npm install
hugo --gc --minify --environment production --baseURL "https://wandersen.dev/"
```

Review changes to:

- `go.mod`
- `go.sum`
- `package-lock.json`
- `packages/hugoautogen/`

The scheduled GitHub Action runs the same update flow and only opens a PR after the updated site builds.

## Local Overrides

Custom behavior is implemented through local overrides instead of editing the theme directly:

- `layouts/`
- `assets/css/critical/`
- `assets/css/non-critical/`
- `data/json_resume/`
- `content/`

Theme updates should preserve these files, but still review generated pages after each update.

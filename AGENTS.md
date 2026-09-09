# Project notes

## Deployment

- Repository: https://github.com/ryancobb/wingfoil
- Live game: https://ryancobb.github.io/wingfoil/
- Hosting: GitHub Pages, with **GitHub Actions** as the Pages source.
- Deploy by committing the intended changes and pushing `main` to `origin`. Every push to `main` triggers `.github/workflows/deploy.yml`; it can also be run manually with `gh workflow run deploy.yml --repo ryancobb/wingfoil --ref main`.
- The workflow uses Node 22, runs `npm ci`, `npm test`, and the browser suite with Playwright Chromium, builds with `npm run build -- --base /wingfoil/`, and publishes the `dist/` artifact. Keep the `/wingfoil/` base path for Pages assets. `dist/` is generated and ignored by Git.
- Check the deployment in GitHub Actions and verify the live game loads and starts before reporting a deployment complete. See the README's Deployment section for commands.

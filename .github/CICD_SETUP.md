# CI/CD Setup

This project uses GitHub Actions to automatically build and deploy to Railway on every push to `master`.

## How it works

1. **Push to master** → GitHub Actions triggered
2. **Install dependencies** → `npm ci` for server and client
3. **Build** → `npm run build` creates production bundles
4. **Deploy** → Railway CLI deploys the app automatically

## Required GitHub Secrets

To enable auto-deployment, add these secrets in **GitHub → Settings → Secrets → Actions**:

| Secret Name | Where to get it |
|-------------|-----------------|
| `RAILWAY_TOKEN` | [Railway Dashboard](https://railway.app) → Account Settings → Create Token |

### Getting your Railway Token:
1. Go to https://railway.app
2. Click your avatar → **Settings**
3. Scroll to **Tokens** → Create New Token
4. Copy the token and add it as `RAILWAY_TOKEN` in GitHub Secrets

## Manual Deployment

If you need to deploy without pushing:
```bash
railway login
railway up
```

## Troubleshooting

**Build fails?** Check the GitHub Actions logs — most failures are missing dependencies or env vars.

**Deployment stuck?** Run `railway logs` to see Railway-side errors.

**Want to disable auto-deploy?** You can disable the workflow in GitHub → Actions → ... → Disable workflow
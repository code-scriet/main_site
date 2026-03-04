#!/bin/bash

# Deploy Playground to Vercel
# Usage: ./deploy.sh

set -e

echo "🚀 Deploying Code.Scriet Playground to Vercel..."
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

echo "📦 Building playground..."
npm run build

echo ""
echo "🌐 Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Go to your Vercel dashboard"
echo "2. Navigate to Settings → Domains"
echo "3. Add custom domain: playground.codescriet.dev"
echo "4. Configure DNS (CNAME: playground → cname.vercel-dns.com)"
echo ""
echo "📖 See CUSTOM_DOMAIN_SETUP.md for detailed instructions"

# Ownlyfans PoC

Decentralized content platform with referral rewards on Sui blockchain.

去中心化內容平台，在 Sui 區塊鏈上帶有推廣獎勵。

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Blockchain**: Sui (testnet)
- **Storage**: Walrus (decentralized storage)
- **Encryption**: Seal SDK (for content access control)
- **Smart Contracts**: Move language

## Project Structure

```
ownlyfans/
├── frontend/          # React frontend application
├── contracts/         # Sui Move smart contracts
└── PRD.txt           # Product Requirements Document
```

## Features

### Creator Side (創作者端)

- **Register as Creator** with custom subscription pricing
- Upload **Seal-encrypted** content to Walrus decentralized storage
- Set per-file price and referral split ratio
- Create content on-chain with metadata and access control

### Fan Side (粉絲端)

- Browse available encrypted content
- **Two purchase options**:
  - **Per-file purchase**: Buy individual content
  - **Creator subscription**: Access all content from a creator (5 min expiry for testing)
- Generate and share referral links
- **Decrypt and view** purchased/subscribed content via Seal SDK
- Track referral earnings

### Smart Contract Features

- **Creator registry** with subscription pricing and Seal namespace
- **Allowlist-based access control** for per-file purchases
- **Subscription system** with time-based expiration
- **Seal access policy** enforcing allowlist OR subscription OR creator access
- Automatic revenue splitting on purchase with referral support
- Anti-self-referral protection (no referral reward for self-referral)
- Protocol-level duplicate transaction prevention

## Setup

### Prerequisites

- Node.js 18+ and npm
- Sui CLI installed
- Sui Wallet browser extension

### Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Contracts (no additional dependencies needed)
cd ../contracts
```

### Configure

1. Set contract package ID after deployment:

   - Edit `frontend/src/utils/contract.ts`
   - Set `CONTRACT_PACKAGE_ID` to your deployed package ID

2. Seal SDK configuration:

   - Edit `frontend/src/config/seal.ts`
   - Seal key servers are pre-configured for testnet (Mysten Labs servers)
   - Update `SEAL_POLICY_PACKAGE_ID` to your deployed package ID after deployment

## Development

### Frontend

```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173`

### Smart Contracts

```bash
cd contracts
sui move build
```

## Deployment

### Deploy Smart Contracts

```bash
cd contracts

# Build
sui move build

# Deploy to testnet
sui client publish --gas-budget 100000000

# Note the published package ID and update frontend/src/utils/contract.ts
```

## Usage

### For Creators

1. Connect your Sui wallet
2. Switch to "Creator Dashboard"
3. **Register as Creator** (first time only):
   - Set subscription price
   - Click "Register as Creator"
4. Upload **encrypted** content:
   - Select a file (image or video)
   - Set per-file price in SUI
   - Set referral split ratio (0-100%)
   - Click "Create Content"
   - Content is automatically **Seal-encrypted** before upload
5. Content is stored encrypted on Walrus and registered on-chain

### For Fans

1. Connect your Sui wallet
2. Switch to "Fan Dashboard"
3. Browse available encrypted content
4. **Two ways to access content**:
   - **Per-file purchase**: Click "Purchase" to buy individual content
   - **Creator subscription**: Click "Subscribe to Creator" for access to all their content (5 min expiry for testing)
5. View purchased/subscribed content:
   - Click "View Content"
   - Seal SDK automatically **decrypts** content using your wallet
   - Content displays in browser
6. Share your referral link to earn rewards
7. Check "Revenue Dashboard" for earnings

## Testing

### Verify Smart Contracts

```bash
cd contracts
sui move build
sui move test  # If tests are added
```

### Verify Frontend

```bash
cd frontend
npm run build
npm run dev
```

## Important Notes

- This is a PoC (Proof of Concept) - not production ready
- Uses Sui testnet with Mysten Labs Seal key servers
- All content is **Seal-encrypted** - only authorized users can decrypt
- Contract package ID must be set after deployment in both `contract.ts` and `seal.ts`
- Protocol layer guarantees transaction uniqueness (no duplicate execution)
- **Creator registration required** before uploading content
- **Subscription expiry**: 5 minutes for testing (can be adjusted in `subscription.move`)
- Two access models: **per-file purchase** OR **creator subscription**

## Future Enhancements

- NFT minting for content
- Multi-level referral system
- Subscription model
- Advanced analytics
- Fan tokens
- DAO governance

## Deployment & Testing

詳細的部署和測試步驟請參考 [DEPLOYMENT.md](./DEPLOYMENT.md)

## License

See PRD.txt for project details and scope.

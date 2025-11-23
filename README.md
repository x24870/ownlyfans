# Ownlyfans PoC

Decentralized content platform with referral rewards on Sui blockchain.

去中心化內容平台，在 Sui 區塊鏈上帶有推廣獎勵。

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Blockchain**: Sui (testnet)
- **Storage**: Walrus (decentralized storage)
- **Encryption**: Seal SDK (for content access control)
- **Smart Contracts**: Move language
- **Testing**: Sui Move test framework (31 test cases)
- **Wallet Integration**: Sui Wallet (@mysten/dapp-kit)

## Project Structure

```
ownlyfans/
├── frontend/                    # React frontend application
│   ├── src/
│   │   ├── pages/              # Dashboard pages
│   │   │   ├── CreatorDashboard.tsx
│   │   │   ├── FanDashboard.tsx
│   │   │   └── RevenueDashboard.tsx
│   │   ├── utils/              # Helper utilities
│   │   │   ├── contract.ts     # Smart contract interactions
│   │   │   ├── sealHelpers.ts  # Seal SDK integration
│   │   │   ├── walrusHelpers.ts # Walrus storage integration
│   │   │   └── suiClient.ts    # Sui client configuration
│   │   ├── config/
│   │   │   └── seal.ts         # Seal SDK configuration
│   │   └── App.tsx             # Main application component
│   └── public/                 # Static assets
├── contracts/                   # Sui Move smart contracts
│   ├── sources/                 # Contract source files
│   │   ├── creator_registry.move
│   │   ├── content_registry.move
│   │   ├── allowlist.move
│   │   ├── subscription.move
│   │   ├── referral_split.move
│   │   ├── seal_access.move
│   │   ├── fan_token.move
│   │   └── campaign.move
│   └── tests/                  # Test files
│       └── ownlyfans_tests.move # Comprehensive test suite
├── DEPLOYMENT.md                # Deployment guide
├── PRD.txt                      # Product Requirements Document
└── README.md                    # This file
```

## Features

### Creator Side (創作者端)

- **Register as Creator** with custom subscription pricing
- Upload **Seal-encrypted** content to Walrus decentralized storage
- Set per-file price and referral split ratio
- Create content on-chain with metadata and access control
- **Create Campaigns**: Organize fan engagement campaigns with token costs
- **Track Content Performance**: View sold count and content statistics
- **Fan Token Integration**: Automatic token rewards for creator interactions

### Fan Side (粉絲端)

- Browse available encrypted content
- **Two purchase options**:
  - **Per-file purchase**: Buy individual content
  - **Creator subscription**: Access all content from a creator (5 min expiry for testing)
- **Fan Token System**:
  - Earn tokens through purchases and subscriptions
  - Early buyer bonuses (2.0x for first 10 sales, 1.5x for next 90)
  - Loyalty streaks for consecutive subscriptions (up to 1.5x multiplier)
  - Burn tokens to join creator campaigns
- Generate and share referral links
- **Decrypt and view** purchased/subscribed content via Seal SDK
- **Join Campaigns**: Participate in creator campaigns using fan tokens
- Track referral earnings in Revenue Dashboard

### Smart Contract Features

#### Core Modules

- **Creator Registry** (`creator_registry.move`): Creator registration with subscription pricing and Seal namespace
- **Content Registry** (`content_registry.move`): On-chain content metadata with Seal integration
- **Allowlist** (`allowlist.move`): Per-file purchase access control
- **Subscription** (`subscription.move`): Time-based subscription system (5 min expiry for testing)
- **Seal Access** (`seal_access.move`): Access policy enforcing allowlist OR subscription OR creator access
- **Referral Split** (`referral_split.move`): Automatic revenue splitting with referral support

#### Advanced Features

- **Fan Token System** (`fan_token.move`):
  - Token rewards for purchases and subscriptions
  - Early buyer bonus tiers (2.0x, 1.5x, 1.0x based on sold count)
  - Loyalty streak system (1.0x to 1.5x multiplier based on consecutive subscriptions)
  - Token burning for campaign participation
  - Creator token statistics tracking
- **Campaign System** (`campaign.move`):
  - Creator-created campaigns with token costs
  - One-time participation enforcement
  - Campaign activation/deactivation
- **Anti-self-referral protection**: No referral reward for self-referral or creator-as-referral
- **Protocol-level duplicate transaction prevention**: Sui blockchain guarantees

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
3. Browse available encrypted content from all creators
4. **Two ways to access content**:
   - **Per-file purchase**: Click "Purchase" to buy individual content
   - **Creator subscription**: Click "Subscribe to Creator" for access to all their content (5 min expiry for testing)
5. **Earn Fan Tokens**:
   - Automatic token rewards on purchases (with early buyer bonuses)
   - Automatic token rewards on subscriptions (with loyalty streak bonuses)
   - View token balance and stats for each creator
6. **Join Campaigns**:
   - Browse creator campaigns
   - Burn fan tokens to participate in campaigns
   - One-time participation per campaign
7. View purchased/subscribed content:
   - Click "View Content"
   - Seal SDK automatically **decrypts** content using your wallet
   - Content displays in browser
8. Share your referral link to earn rewards
9. Check "Revenue Dashboard" for referral earnings and statistics

## Testing

### Smart Contract Tests

The project includes comprehensive test coverage with 31 test cases covering all major functionality:

```bash
cd contracts
sui move build
sui move test
```

**Test Coverage:**

- ✅ Creator registration and content creation
- ✅ Purchase and allowlist management
- ✅ Subscription validity and expiration
- ✅ Seal access control (allowlist, subscription, creator access)
- ✅ Fan token account creation and management
- ✅ Reward calculation (content purchases with early buyer bonuses)
- ✅ Reward calculation (subscriptions with loyalty streaks)
- ✅ Token burning and balance management
- ✅ Campaign creation, joining, and management
- ✅ Referral system (with/without referral, self-referral prevention)
- ✅ Fan token rewards on purchases and subscriptions
- ✅ Streak increment and reset logic

**Current Status**: 28/31 tests passing (90% pass rate)

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

### Fan Token System Details

- **Token Rewards**:
  - Content purchases: Base rate × action multiplier (1.0x) × early buyer bonus (2.0x/1.5x/1.0x)
  - Subscriptions: Base rate × action multiplier (0.7x) × loyalty streak (1.0x to 1.5x)
- **Early Buyer Bonuses**:
  - First 10 sales: 2.0x multiplier
  - Sales 10-99: 1.5x multiplier
  - Sales 100+: 1.0x multiplier
- **Loyalty Streaks**:
  - Streak 1: 1.0x multiplier
  - Streak 2: 1.1x multiplier
  - Streak 3: 1.2x multiplier
  - Streak 4: 1.3x multiplier
  - Streak 5: 1.4x multiplier
  - Streak 6+: 1.5x multiplier
- **Grace Period**: 3 days for maintaining streak between subscriptions
- **Campaign Participation**: Burn fan tokens to join creator campaigns (one-time per campaign)

## Smart Contract Architecture

### Module Overview

```
contracts/sources/
├── creator_registry.move    # Creator registration and management
├── content_registry.move     # Content metadata and Seal integration
├── allowlist.move            # Per-file purchase access control
├── subscription.move         # Subscription system with fan token rewards
├── referral_split.move       # Revenue splitting with referral support
├── seal_access.move          # Seal-based access policy enforcement
├── fan_token.move            # Fan token system (rewards, streaks, burning)
└── campaign.move             # Creator campaign system
```

### Key Design Decisions

- **Shared Objects**: Creator, Content, Allowlist, Subscription, Campaign, and Stats objects are shared for multi-user access
- **Owned Objects**: FanTokenAccount objects are owned by users for direct control
- **Seal Integration**: Deterministic Seal IDs based on creator namespace + content suffix
- **Event-Driven**: Comprehensive event emission for frontend tracking
- **Test Coverage**: 31 test cases covering all major functionality

## Future Enhancements

- NFT minting for content ownership
- Multi-level referral system (referral chains)
- Extended subscription periods (beyond 5 minutes)
- Advanced analytics dashboard
- DAO governance for platform decisions
- Token staking mechanisms
- Content curation and discovery features

## Deployment & Testing

詳細的部署和測試步驟請參考 [DEPLOYMENT.md](./DEPLOYMENT.md)

## License

See PRD.txt for project details and scope.

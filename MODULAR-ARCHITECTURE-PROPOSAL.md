# Modular eBay Platform - Architecture Proposal

**Date**: 2025-11-19
**Status**: Design Phase
**Goal**: Create a modular, n8n-inspired architecture for eBay operations

---

## EXECUTIVE SUMMARY

### Current State Analysis

**Existing App Strengths:**
- ✅ Secure OAuth implementation with PKCE
- ✅ Encrypted token storage (AES-256-CBC)
- ✅ Serverless architecture (Netlify Functions)
- ✅ Row-level security (Supabase RLS)
- ✅ Automated price reduction engine
- ✅ Real-time dashboard with React

**N8N Workflow Strengths:**
- ✅ Visual workflow builder
- ✅ Modular node-based processing
- ✅ Google Sheets integration
- ✅ AI-powered validation (Claude)
- ✅ Complex field mapping/transformations
- ✅ Multi-API orchestration

**Opportunity:**
Combine the **security & architecture** of your app with the **modularity & flexibility** of n8n workflows.

---

## PROPOSED ARCHITECTURE

### Core Concept: "Workflow Engine" Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                     MODULAR eBay PLATFORM                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Workflow   │  │   Workflow   │  │   Workflow   │      │
│  │   Builder    │  │   Runner     │  │   Monitor    │      │
│  │   (UI)       │  │   (Engine)   │  │   (Logs)     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
├────────────────────────────┼─────────────────────────────────┤
│                    EXECUTION LAYER                           │
│                            │                                 │
│  ┌─────────┬─────────┬────┴────┬─────────┬──────────┐      │
│  │  Node   │  Node   │  Node   │  Node   │   Node   │      │
│  │ Library │ Library │ Library │ Library │ Library  │      │
│  └─────────┴─────────┴─────────┴─────────┴──────────┘      │
│      │         │          │         │          │            │
│   [eBay]   [Keepa]   [Sheets]  [Claude]  [Database]        │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE                             │
│                                                               │
│  ┌───────────┬────────────┬─────────────┬─────────────┐     │
│  │  Auth     │  Storage   │   Queue     │   Cache     │     │
│  │  (OAuth)  │  (Supabase)│   (BullMQ)  │   (Redis)   │     │
│  └───────────┴────────────┴─────────────┴─────────────┘     │
└───────────────────────────────────────────────────────────────┘
```

---

## MODULE STRUCTURE

### 1. Core Modules (Always Present)

```
/modules/
├── core/
│   ├── workflow-engine/      # Executes workflows
│   ├── node-registry/         # Available operations
│   ├── auth/                  # OAuth, credentials
│   ├── storage/               # Database, files
│   └── monitoring/            # Logs, metrics
```

### 2. Node Libraries (Pluggable)

```
/modules/nodes/
├── ebay/
│   ├── oauth.js              # eBay authentication
│   ├── fetch-listings.js     # Get inventory
│   ├── create-listing.js     # New listings
│   ├── update-price.js       # Price changes
│   ├── end-listing.js        # Delist items
│   └── get-categories.js     # Category lookup
├── keepa/
│   ├── fetch-product.js      # Product research
│   ├── price-history.js      # Historical prices
│   └── competitor-analysis.js
├── sheets/
│   ├── read-sheet.js
│   ├── write-sheet.js
│   └── update-row.js
├── ai/
│   ├── claude-review.js      # AI listing review
│   ├── generate-title.js     # SEO optimization
│   └── categorize.js         # Auto-categorization
├── database/
│   ├── query.js
│   ├── insert.js
│   ├── update.js
│   └── upsert.js
└── transforms/
    ├── map-fields.js         # Field mapping
    ├── validate.js           # Data validation
    ├── format.js             # Format conversion
    └── merge.js              # Combine data
```

### 3. Workflow Definitions (JSON)

```json
{
  "id": "price-reduction-workflow",
  "name": "Automated Price Reduction",
  "trigger": {
    "type": "cron",
    "schedule": "0 */6 * * *"
  },
  "nodes": [
    {
      "id": "fetch-listings",
      "type": "ebay.fetch-listings",
      "config": {
        "filter": "price_reduction_enabled = true"
      }
    },
    {
      "id": "calculate-new-price",
      "type": "transforms.calculate",
      "config": {
        "formula": "current_price * 0.95"
      }
    },
    {
      "id": "update-price",
      "type": "ebay.update-price",
      "config": {
        "sku": "{{ nodes.fetch-listings.output.sku }}",
        "newPrice": "{{ nodes.calculate-new-price.output }}"
      }
    },
    {
      "id": "log-change",
      "type": "database.insert",
      "config": {
        "table": "price_history",
        "data": {
          "listing_id": "{{ nodes.fetch-listings.output.id }}",
          "old_price": "{{ nodes.fetch-listings.output.price }}",
          "new_price": "{{ nodes.calculate-new-price.output }}"
        }
      }
    }
  ],
  "edges": [
    {"from": "fetch-listings", "to": "calculate-new-price"},
    {"from": "calculate-new-price", "to": "update-price"},
    {"from": "update-price", "to": "log-change"}
  ]
}
```

---

## KEY FEATURES

### 1. Node-Based Architecture

**Benefits:**
- Reusable components across workflows
- Easy to test in isolation
- Clear separation of concerns
- Community can contribute nodes

**Node Interface:**
```javascript
// Example: ebay/update-price.js
export default {
  name: 'Update eBay Price',
  description: 'Updates the price of an eBay listing',

  inputs: {
    sku: { type: 'string', required: true },
    newPrice: { type: 'number', required: true },
    userId: { type: 'string', required: true }
  },

  outputs: {
    success: { type: 'boolean' },
    listingId: { type: 'string' },
    oldPrice: { type: 'number' },
    newPrice: { type: 'number' }
  },

  async execute({ inputs, context }) {
    // 1. Get user's eBay credentials
    const credentials = await context.auth.getEbayCredentials(inputs.userId);

    // 2. Call eBay API
    const result = await context.ebay.updatePrice({
      sku: inputs.sku,
      price: inputs.newPrice,
      credentials
    });

    // 3. Return outputs
    return {
      success: true,
      listingId: result.listingId,
      oldPrice: result.oldPrice,
      newPrice: result.newPrice
    };
  }
};
```

### 2. Workflow Engine

**Features:**
- Sequential execution
- Parallel branches
- Conditional logic (if/else)
- Loops (for each item)
- Error handling & retries
- Rate limiting
- Progress tracking

**Engine Implementation:**
```javascript
// modules/core/workflow-engine/runner.js
export class WorkflowRunner {
  async execute(workflow, context) {
    const state = new WorkflowState();

    for (const node of workflow.nodes) {
      try {
        // Load node module
        const nodeModule = await this.loadNode(node.type);

        // Resolve inputs from previous nodes
        const inputs = this.resolveInputs(node.config, state);

        // Execute node
        const output = await nodeModule.execute({
          inputs,
          context: {
            userId: context.userId,
            auth: this.authService,
            ebay: this.ebayService,
            database: this.databaseService
          }
        });

        // Store output for next nodes
        state.setNodeOutput(node.id, output);

        // Log execution
        await this.logExecution(node, output);

      } catch (error) {
        await this.handleError(node, error);
        if (node.continueOnError !== true) {
          throw error;
        }
      }
    }

    return state.getFinalOutput();
  }
}
```

### 3. Visual Workflow Builder

**UI Components:**
- Drag-and-drop canvas (React Flow)
- Node palette (categorized)
- Connection validation
- Live preview
- Test execution
- Version control

**Example UI:**
```jsx
// frontend/src/pages/WorkflowBuilder.jsx
import ReactFlow from 'react-flow-renderer';

export function WorkflowBuilder() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  const nodeTypes = {
    'ebay.fetch-listings': EbayFetchListingsNode,
    'transforms.calculate': CalculateNode,
    'ebay.update-price': EbayUpdatePriceNode
  };

  return (
    <div className="workflow-builder">
      <NodePalette onAddNode={addNode} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
      />
      <PropertiesPanel selectedNode={selectedNode} />
    </div>
  );
}
```

### 4. Execution Monitoring

**Dashboard Features:**
- Real-time execution status
- Node-by-node progress
- Error logs with stack traces
- Performance metrics
- Retry management
- Manual intervention

---

## DATABASE SCHEMA ADDITIONS

```sql
-- Workflows table
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  definition JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow executions table
CREATE TABLE workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id),
  user_id UUID REFERENCES users(id),
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  node_outputs JSONB,
  metrics JSONB
);

-- Node execution logs
CREATE TABLE node_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_execution_id UUID REFERENCES workflow_executions(id),
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  inputs JSONB,
  outputs JSONB,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- Workflow templates (pre-built workflows)
CREATE TABLE workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  definition JSONB NOT NULL,
  author_id UUID REFERENCES users(id),
  public BOOLEAN DEFAULT false,
  installs_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## MIGRATION STRATEGY

### Phase 1: Foundation (Week 1-2)

**Goals:**
- Set up new repository
- Copy existing auth/database modules
- Create workflow engine skeleton
- Build basic node interface

**Deliverables:**
- [ ] New Git repository: `ebay-platform-modular`
- [ ] Core modules: auth, storage, monitoring
- [ ] WorkflowRunner class (basic execution)
- [ ] Node interface specification
- [ ] Database migrations

### Phase 2: Core Nodes (Week 3-4)

**Goals:**
- Migrate existing functions to node modules
- Implement 10 core nodes
- Add error handling & retries

**Nodes to Create:**
```
✓ ebay.oauth (from ebay-oauth.js)
✓ ebay.fetch-listings (from ebay-fetch-listings.js)
✓ ebay.update-price (from update-item-price.js)
✓ ebay.create-listing (from create-ebay-listing.js)
✓ ebay.end-listing (from end-listing.js)
✓ database.query
✓ database.insert
✓ database.update
✓ transforms.map-fields
✓ transforms.calculate
```

### Phase 3: Workflow Builder UI (Week 5-6)

**Goals:**
- React Flow integration
- Node palette
- Properties panel
- Test execution

**Components:**
- [ ] WorkflowCanvas.jsx
- [ ] NodePalette.jsx
- [ ] PropertiesPanel.jsx
- [ ] ExecutionMonitor.jsx

### Phase 4: Advanced Features (Week 7-8)

**Goals:**
- Conditional logic (if/else nodes)
- Loops (for each)
- Sub-workflows
- Template marketplace

**Features:**
- [ ] Conditional branching
- [ ] Loop nodes
- [ ] Error handling nodes
- [ ] Template library
- [ ] Workflow sharing

### Phase 5: Production Hardening (Week 9-10)

**Goals:**
- Performance optimization
- Security audit
- Documentation
- Migration from old app

**Tasks:**
- [ ] Load testing
- [ ] Rate limiting
- [ ] Security review
- [ ] User migration script
- [ ] Documentation

---

## COMPARISON: Old vs New

| Feature | Current App | Modular Platform |
|---------|-------------|------------------|
| **Architecture** | Fixed functions | Modular nodes |
| **Customization** | Code changes | Visual builder |
| **Adding features** | Write code | Plug in nodes |
| **Testing** | Manual | Node-level testing |
| **Reusability** | Copy-paste | Node marketplace |
| **Debugging** | Logs only | Visual execution trace |
| **Scalability** | Monolithic | Microservices-ready |
| **Learning curve** | Developer | Business user |

---

## EXAMPLE WORKFLOWS

### 1. Price Reduction (Migration from current app)

```yaml
Name: Automated Price Reduction
Trigger: Cron (every 6 hours)
Nodes:
  1. Database Query: Get listings with price_reduction_enabled=true
  2. For Each Listing:
     a. Calculate New Price: current_price * (1 - reduction_percentage)
     b. eBay Update Price: Update listing
     c. Database Insert: Log price change
  3. Send Notification: Email summary
```

### 2. Amazon to eBay (From n8n workflow)

```yaml
Name: Amazon to eBay Listing
Trigger: Google Sheets row added
Nodes:
  1. Google Sheets Read: Get new row
  2. Keepa Fetch Product: Get Amazon data
  3. Transform Data: Map Amazon → eBay fields
  4. Claude Review: AI validation
  5. eBay Create Inventory Item
  6. eBay Create Offer
  7. eBay Publish Offer
  8. Google Sheets Update: Mark as "Published"
```

### 3. Competitive Pricing (New capability)

```yaml
Name: Competitive Price Monitoring
Trigger: Cron (daily)
Nodes:
  1. Database Query: Get active listings
  2. For Each Listing:
     a. eBay Search Completed: Find sold comparables
     b. Calculate Suggested Price: Average of recent sales
     c. If (suggested_price < current_price):
        - Update Price
        - Log Change
     d. Else:
        - Skip
  3. Send Report: Email with changes
```

---

## TECHNICAL DECISIONS

### Why Not Fork n8n?

**Pros of using n8n:**
- Mature workflow engine
- Large node ecosystem
- Active community

**Cons:**
- Heavy (full application)
- Complex customization
- Self-hosting overhead
- Learning curve for users
- Can't use Netlify serverless

**Decision:** Build custom engine that:
- Reuses concepts from n8n
- Integrates with existing Supabase/Netlify stack
- Lighter weight
- eBay-focused

### Technology Stack

**Backend:**
- Netlify Functions (existing)
- Supabase (existing)
- BullMQ (new - for job queue)
- Redis (new - for caching)

**Frontend:**
- React + Vite (existing)
- React Flow (new - for workflow canvas)
- Tailwind CSS (existing)

**Database:**
- PostgreSQL (existing - Supabase)
- JSONB for workflow definitions

---

## DEVELOPER EXPERIENCE

### Creating a New Node

```bash
# CLI tool
$ npm run create-node

? Node category: eBay
? Node name: Get Category Details
? Description: Fetches eBay category information
✓ Created: modules/nodes/ebay/get-category-details.js
✓ Created: modules/nodes/ebay/get-category-details.test.js
✓ Registered in node registry
```

**Generated file:**
```javascript
// modules/nodes/ebay/get-category-details.js
export default {
  name: 'Get Category Details',
  category: 'eBay',
  description: 'Fetches eBay category information',

  inputs: {
    categoryId: {
      type: 'string',
      required: true,
      description: 'eBay category ID'
    }
  },

  outputs: {
    categoryName: { type: 'string' },
    aspectsRequired: { type: 'array' },
    conditions: { type: 'array' }
  },

  async execute({ inputs, context }) {
    // TODO: Implement
    throw new Error('Not implemented');
  }
};
```

### Testing a Node

```javascript
// modules/nodes/ebay/get-category-details.test.js
import { test, expect } from 'vitest';
import getCategoryDetails from './get-category-details.js';

test('fetches category details', async () => {
  const result = await getCategoryDetails.execute({
    inputs: {
      categoryId: '178154'
    },
    context: {
      userId: 'test-user',
      ebay: mockEbayService
    }
  });

  expect(result.categoryName).toBe('Cell Phones & Accessories');
  expect(result.aspectsRequired).toContain('Brand');
});
```

---

## ROLLOUT PLAN

### Option A: Big Bang Migration

**Timeline:** 10 weeks
**Risk:** High
**Approach:** Build complete platform, migrate all users at once

**Pros:**
- Clean break
- No maintaining two codebases

**Cons:**
- High risk if bugs
- All users affected by issues

### Option B: Gradual Migration (RECOMMENDED)

**Timeline:** 16 weeks
**Risk:** Medium
**Approach:** Run both systems in parallel

**Phases:**
1. **Week 1-10:** Build modular platform
2. **Week 11:** Beta testing with 5 users
3. **Week 12-14:** Migrate 25% of users
4. **Week 15:** Monitor and fix issues
5. **Week 16:** Migrate remaining users

**Pros:**
- Lower risk
- Time to fix bugs
- Gradual rollout

**Cons:**
- Maintain two codebases temporarily
- More complex

### Option C: Feature Flagging

**Timeline:** 12 weeks
**Risk:** Low
**Approach:** Build in same codebase, toggle via feature flags

**Implementation:**
```javascript
// Feature flag
if (user.features.includes('workflow-engine')) {
  return executeWorkflow(workflowId);
} else {
  return legacyPriceReduction();
}
```

**Pros:**
- Lowest risk
- Easy rollback
- Same deployment

**Cons:**
- Code complexity
- Harder to test

---

## COST ANALYSIS

### Current Infrastructure (Monthly)

- Netlify: $19 (Pro plan)
- Supabase: $25 (Pro plan)
- Domain: $2
- **Total: $46/month**

### New Infrastructure (Monthly)

- Netlify: $19 (Pro plan)
- Supabase: $25 (Pro plan)
- Redis (Upstash): $10 (free tier → $10)
- Domain: $2
- **Total: $56/month (+$10)**

**Cost per user:**
- Current: $46 / 100 users = $0.46/user
- New: $56 / 100 users = $0.56/user
- **Increase: $0.10/user/month**

---

## SUCCESS METRICS

### Technical Metrics

- [ ] Node execution time < 500ms (p95)
- [ ] Workflow execution success rate > 99%
- [ ] Zero downtime deployments
- [ ] Test coverage > 80%

### Business Metrics

- [ ] Time to add new feature: 1 day → 1 hour
- [ ] User customization: 0% → 80%
- [ ] Support tickets: -50%
- [ ] User satisfaction: +25%

---

## NEXT STEPS

### Immediate Actions (This Week)

1. **Review this proposal** with team
2. **Create new repository**: `ebay-platform-modular`
3. **Set up project structure**
4. **Choose migration strategy** (A, B, or C)

### Get Started (Week 1)

```bash
# Create new repo
mkdir ebay-platform-modular
cd ebay-platform-modular

# Initialize
npm init -y
git init

# Copy existing infrastructure
cp -r ../ebay-price-reducer/netlify .
cp -r ../ebay-price-reducer/frontend .
cp ../ebay-price-reducer/netlify.toml .

# Create new module structure
mkdir -p modules/{core,nodes}/{workflow-engine,auth,storage}
mkdir -p modules/nodes/{ebay,keepa,sheets,ai,database,transforms}

# Install dependencies
npm install bullmq ioredis react-flow-renderer
```

### Questions to Answer

1. **Which migration strategy?** (A, B, or C)
2. **Timeline commitment?** (10-16 weeks)
3. **Team size?** (Solo or hire help)
4. **Budget?** (Redis, potential contractors)
5. **Beta testers?** (Who can test early)

---

## CONCLUSION

This modular architecture combines:
- ✅ **Security** of your current app
- ✅ **Flexibility** of n8n workflows
- ✅ **Scalability** for future growth
- ✅ **User control** via visual builder

**Recommended path:** Option B (Gradual Migration)
**Timeline:** 16 weeks
**Cost:** +$10/month infrastructure

The result will be a platform where users can:
- Build custom workflows visually
- Reuse community-contributed nodes
- Scale from simple automation to complex integrations
- Maintain full control over their eBay operations

Ready to proceed? Let's start with Phase 1! 🚀

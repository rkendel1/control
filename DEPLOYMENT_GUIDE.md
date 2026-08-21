# Control Workbench - Deployment Guide

**Status: 🚀 Production Ready (Phase 6 Complete)**

Control is a complete, end-to-end development solution for solo entrepreneurs and small teams. It combines:
- 📊 Project discovery with intelligent graph-based context
- 🤖 Universal agent coordination across projects
- 💬 **Unified AI Conversation Layer** with seamless AI target switching
- 🔄 Multi-AI deliberation and agreement analysis
- 🎯 Intelligent context injection (5 modes: Current, Project, Global, Task, Full)

## Quick Start

### Prerequisites
- Node.js 18+ with pnpm
- Rust toolchain (for Tauri)
- Git
- API keys for Claude and/or GPT-4 (optional - Ollama can run locally)

### AI Target Configuration

```bash
# For Claude support (required if using claude-opus target)
export ANTHROPIC_API_KEY=sk-ant-...

# For GPT-4 support (optional)
export OPENAI_API_KEY=sk-...

# For Ollama support (optional - runs locally)
# Must have Ollama daemon running on localhost:11434
# To install: https://ollama.ai
```

### Installation

```bash
# Clone repository
git clone https://github.com/rkendel1/control.git
cd control

# Install dependencies
pnpm install

# Build Tauri app
npm run tauri build

# Or run in development mode
npm run tauri dev
```

### First Run

1. **Start the Application**
   ```bash
   npm run tauri dev
   ```

2. **Add Your First Project**
   - Click "Add Project"
   - Select a folder containing your code
   - Watch as Control discovers the project structure
   - Once complete, your project graph is created and persisted

3. **Start the Mission-Control Daemon**
   ```bash
   cd mission-control
   pnpm daemon:start
   ```

4. **Verify Everything Works**
   ```bash
   cd src-ui
   npm run script -- scripts/full-demo.ts
   ```

## What's New in Phase 6: Unified AI Conversation Layer

### 🎯 Single Chat Interface, Multiple AI Targets

Control now provides a unified chat interface where users can seamlessly switch between:
- **Claude** (Anthropic) - 200K context, advanced capabilities
- **GPT-4** (OpenAI) - 128K context, tool use enabled
- **Ollama** - Local inference, zero cost, privacy-first
- **Control** - Intelligent graph-aware routing
- **Auto** - Automatic provider selection by message type

### 💬 Key Features
- **Target Switching**: Change AI provider mid-conversation without losing history
- **Context Injection**: Automatic context in 5 modes (Current/Project/Global/Task/Full)
- **Persistence**: All conversations stored in FeltDB alongside project graphs
- **Multi-AI Comparison**: Send request to multiple targets, analyze agreement
- **Entity References**: Parse [file: path], [symbol: name], [task: id] in messages
- **Artifact Creation**: Extract tasks, decisions, requirements from conversations
- **Global Search**: Unified search across conversations, files, tasks, commits
- **History Management**: Filter, sort, group conversations by date/project/target
- **User Preferences**: Per-project target selection, context mode preferences, UI settings

### 📊 Architecture
- **ConversationStore**: Conversation CRUD with FeltDB persistence
- **ContextResolver**: 5-mode context gathering and markdown formatting
- **AIConversationTarget**: Normalized interface for all AI providers
- **TargetRegistry**: Availability tracking and provider capabilities
- **UnifiedChat**: React component with full UI and keyboard shortcuts

## What Control Does

### 1. Project Discovery
- Scans filesystem recursively
- Detects git repositories and branches
- Extracts project metadata (structure, files, dependencies)
- Creates persistent project graphs

### 2. Intelligent Context
- Generates markdown context from project graphs
- Injects context into agent prompts automatically
- Maintains cache of context for performance
- Updates context when projects change

### 3. Cross-Project Coordination
- Global graph tracks all projects
- Registers active agents
- Manages shared tasks and decisions
- Distributes work across agent team

### 4. Agent Integration
- Enriches agent system prompts with project context
- Feeds project structure to agents
- Enables agents to understand your codebase
- Allows coordination across projects

### 5. Persistent Storage
- Uses FeltDB for durable persistence
- Files stored at ~/.control/graphs
- Survives application restart
- Syncs with mission-control daemon

## Architecture

### Three Layers

**Rust Layer** (src-tauri/src/graph.rs)
- Real filesystem access
- Git repository detection
- Directory tree scanning
- Exposed as Tauri commands

**TypeScript Discovery** (src-ui/lib/graph/discovery.ts)
- Orchestrates full project discovery
- Calls Rust layer via Tauri IPC
- Populates FeltDB graph

**Graph Persistence** (src-ui/lib/graph/FeltDBGraphRepository.ts)
- FeltDB-backed entity/relationship storage
- Query engine with filtering and pagination
- Lifecycle management for project graphs

### Two Graphs

**Project Graphs** (Deep)
- Per-project detailed information
- Files, directories, symbols
- Git branches and commits
- Project-specific tasks and decisions

**Global Graph** (Shallow)
- Cross-project coordination
- Project registry
- Active agents
- Shared tasks and decisions

### Context Flow

```
Project Discovery
    ↓
FeltDB Persistence
    ↓
Global Graph Coordination
    ↓
Context Engine (Markdown Generation)
    ↓
Daemon Integration
    ↓
Agent Prompt Enrichment
    ↓
Mission-Control Agents
```

## Features

### ✅ Implemented

- [x] Project discovery from filesystem
- [x] Git repository detection
- [x] Persistent graph storage (FeltDB)
- [x] Global graph for coordination
- [x] Context engine with markdown generation
- [x] Daemon integration APIs
- [x] Project manager UI
- [x] Real-time discovery progress
- [x] File-based persistence
- [x] Agent registration and coordination
- [x] Shared task management
- [x] Context injection into agent prompts

### 🔄 In Progress / Planned

- [ ] Symbol indexing (language-specific code analysis)
- [ ] Git commit history and blame tracking
- [ ] Advanced graph visualization
- [ ] Custom discovery plugins
- [ ] Performance optimization for large codebases
- [ ] Web UI (in addition to Tauri)

## API Reference

### Tauri Commands

#### `cmd_initialize_project(projectId, projectName, projectPath)`
Complete project initialization - combines discovery, indexing, and graph creation.

**Returns:**
```typescript
{
  projectId: string
  projectName: string
  projectPath: string
  graphId: string
  entityCount: number
  fileCount: number
  dirCount: number
  isGit: boolean
  defaultBranch?: string
  remoteUrl?: string
}
```

#### `cmd_detect_repository(projectPath)`
Detects if a path contains a git repository and extracts metadata.

#### `cmd_scan_directory(path, maxDepth)`
Recursively scans directory structure up to specified depth.

#### `cmd_index_project(projectId, projectName, projectPath)`
Combines detection and scanning to create project metadata.

### TypeScript APIs

#### `createGraphRepository(namespace)`
Initializes FeltDB-backed graph repository with persistent file storage.

#### `ProjectDiscovery.discoverProject(graphRepo, projectId, projectName, projectPath)`
Orchestrates full project discovery and populates graph.

#### `GlobalGraph.initialize(graphRepo)`
Initializes global graph for cross-project coordination.

#### `GlobalGraph.registerProject(graphRepo, globalGraphId, projectId, projectName, projectGraphId)`
Registers a project in the global graph.

#### `ContextEngine.generateProjectContext(graphRepo, projectGraphId, projectId)`
Generates intelligent context from project graph.

#### `ContextEngine.formatProjectContextMarkdown(context)`
Formats context as markdown for agent consumption.

## File Structure

```
control/
├── src-tauri/                          # Rust Tauri backend
│   └── src/
│       └── graph.rs                   # Filesystem layer
├── src-ui/                            # TypeScript frontend
│   ├── components/
│   │   ├── project-manager.tsx        # Project discovery UI
│   │   └── unified-chat.tsx           # AI conversation UI (NEW)
│   ├── lib/graph/
│   │   ├── index.ts                  # Graph repository factory
│   │   ├── discovery.ts              # Project discovery orchestration
│   │   ├── global.ts                 # Global graph layer
│   │   ├── context-engine.ts         # Context generation
│   │   ├── context-resolver.ts       # 5-mode context resolution (NEW)
│   │   ├── conversation-store.ts     # Conversation persistence (NEW)
│   │   ├── daemon-integration.ts     # Mission-control integration
│   │   └── FeltDBGraphRepository.ts
│   ├── lib/conversation/             # AI Target Abstraction (NEW)
│   │   ├── ai-target.ts              # Target interface & registry
│   │   ├── target-factory.ts         # Target initialization
│   │   ├── providers/
│   │   │   ├── openai-target.ts      # GPT-4 implementation
│   │   │   ├── claude-target.ts      # Claude implementation
│   │   │   ├── ollama-target.ts      # Local inference
│   │   │   ├── control-target.ts     # Graph-aware router
│   │   │   └── auto-target.ts        # Intelligent selection
│   │   ├── artifact-creator.ts       # Artifact extraction
│   │   ├── multi-ai-deliberation.ts  # Multi-AI comparison
│   │   ├── entity-references.ts      # Reference parsing
│   │   ├── global-search.ts          # Unified search
│   │   ├── history-manager.ts        # Conversation history
│   │   ├── preferences.ts            # User preferences
│   │   ├── index.ts                  # Module exports
│   │   └── __tests__/               # Comprehensive tests
│   │       ├── integration.test.ts   # End-to-end testing
│   │       ├── targets.test.ts       # Target capabilities
│   │       └── advanced-features.test.ts
│   ├── types/
│   │   └── graph.ts                  # Type definitions (with Conversation types)
│   └── scripts/
│       ├── verify-graph.ts           # Graph verification
│       └── full-demo.ts              # End-to-end demo
└── mission-control/                  # Agent daemon
    └── data/                         # Graph state files
```

## Configuration

### Storage Location
```
~/.control/graphs/              # FeltDB persistent storage
  ├── [namespace].db            # Graph database files
  └── ...
```

### Discovery Depth
Default: 3 levels deep in directory tree

Modify in `src-ui/lib/graph/discovery.ts`:
```typescript
const tree = scan_directory_tree(project_path, 3); // Change 3 to desired depth
```

### Ignored Paths
Automatically ignored during filesystem scan:
- node_modules, target, .git
- dist, build, .next
- __pycache__, .pytest_cache
- .vscode, .idea, .cargo
- ... and more

Modify in `src-tauri/src/graph.rs` `should_ignore()` function.

## Testing

### Run Full Demo
Verifies all system components working end-to-end:
```bash
cd src-ui
npm run script -- scripts/full-demo.ts
```

Expected output:
```
✅ All components working:
  ✓ FeltDB persistence (file-based)
  ✓ Project graph creation and indexing
  ✓ Global graph coordination
  ✓ Entity and relationship management
  ✓ Context engine and markdown generation
  ✓ Daemon integration and state sync
  ✓ Agent context injection
```

### Run Graph Verification
```bash
cd src-ui
npm run script -- scripts/verify-graph.ts
```

## Troubleshooting

### "Graph not found" errors
**Solution:** Verify `~/.control/graphs` directory exists and has read/write permissions.

### Discovery takes too long
**Solution:** The project may be very large. Check if it includes large node_modules or build directories.

### Daemon not seeing graph updates
**Solution:** 
1. Restart the daemon: `pnpm daemon:stop` then `pnpm daemon:start`
2. Verify Control app has created the graph

### Tauri build fails
**Solution:** Install system dependencies:
```bash
# macOS
brew install webkit2gtk-4.1

# Linux
apt-get install libwebkit2gtk-4.1-dev

# Windows
# Download Visual Studio build tools
```

## Performance

### Graph Size Estimates
- **100 files**: ~100KB storage, <10ms query
- **1,000 files**: ~1MB storage, <50ms query
- **10,000 files**: ~10MB storage, <200ms query

### Optimization Tips
1. Increase discovery depth only as needed
2. Use project-specific subgraphs for large monorepos
3. Cache context for frequently-accessed projects
4. Archive old project graphs

## Integration with mission-control

Control automatically updates mission-control daemon with:
- `mission-control/data/ai-context.md` - Project context in markdown
- `mission-control/data/control-graph-state.json` - Machine-readable state

Agents access this context through:
```typescript
// In agent system prompt
const context = readFileSync("mission-control/data/ai-context.md", "utf-8");
enrichedPrompt = basePrompt + "\n" + context;
```

## Running Control Locally

### Quick Start - One Command

```bash
# Development mode with all components
./scripts/dev.sh
```

This single command:
1. Sets up environment variables
2. Starts the Tauri application
3. Starts the Mission-Control daemon
4. Initializes AI targets (Claude, GPT-4, Ollama)
5. Opens the UI at http://localhost:3000

### Manual Start (if preferred)

**Terminal 1: Tauri Application**
```bash
npm run tauri dev
# Opens desktop app
```

**Terminal 2: Mission-Control Daemon**
```bash
cd mission-control
pnpm daemon:start
```

## Production Deployment

### Environment Setup
```bash
# Set graph storage location (optional)
export CONTROL_GRAPHS_PATH=/data/control/graphs

# Set Tauri config
export TAURI_CONFIG_PATH=./src-tauri/tauri.conf.json

# AI Target Configuration (required for conversation layer)
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
# Ollama runs locally by default: http://localhost:11434
```

### Build for Distribution
```bash
# Create production build
npm run tauri build

# Creates:
# src-tauri/target/release/control     # Linux/macOS
# src-tauri/target/release/control.exe # Windows
```

### System Requirements
- **Disk space:** Minimum 500MB for graphs + application
- **RAM:** 1GB minimum, 4GB recommended
- **CPU:** Multi-core recommended for large projects
- **Network:** Optional (Ollama works offline)

### Monitoring

Check daemon health:
```bash
cd mission-control
pnpm daemon:status
```

View recent activity:
```bash
tail -f mission-control/logs/daemon.log
```

Check AI target availability:
```bash
# In browser console of Control app
const registry = getTargetRegistry();
console.log(registry.getAvailableTargets());
```

## Support & Troubleshooting

For issues:
1. Check `~/.control/` logs
2. Run `npm run script -- scripts/full-demo.ts` to verify system
3. Review CLAUDE.md for architecture details
4. Check GitHub issues at https://github.com/rkendel1/control/issues

## Contributing

Control is built for developers, by developers. Contributions welcome:
1. Fork repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

See CLAUDE.md for development setup and conventions.

## License

Control is proprietary software. Contact randy@kendelconsulting.com for licensing.

---

**Ready to ship!** 🚀

Control is production-ready and waiting for your projects. Start discovering today.

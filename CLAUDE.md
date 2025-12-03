# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Chiaotu** is a **CLI tool** written in TypeScript (Node.js) for managing and generating proxy configurations for ClashMetaForAndroid and similar proxy clients. The tool processes multiple proxy sources, caches them, and generates unified proxy configurations with organized routing rules.

## Development Commands

### Core Operations
- `npm start` - Execute CLI: `tsx src/index.ts`
- `npm install` - Install dependencies and run post-install setup script

### Quality Assurance
- `npx biome check .` - Run linter and formatter (configured in biome.json)
- `npx biome format .` - Format code
- `npx biome check --apply .` - Auto-fix formatting issues
- `tsc --noEmit` - TypeScript type checking without emitting files
- `npx tsx src/index.ts` - Direct TypeScript execution for testing

## Architecture

### Core Structure
```
src/
├── index.ts              # CLI entry point and command routing
├── commands/             # Business logic modules
│   ├── add.ts           # Add proxy sources (URLs or files)
│   ├── add/preset.ts    # Add local preset files
│   ├── add/upstream.ts  # Add remote upstream URLs
│   └── generate.ts      # Generate final Clash configuration
├── persistence/          # Data persistence layer
│   ├── configuration.ts # Zod schema validation
│   ├── clash-profile.ts # Clash-specific schemas
│   ├── store.ts         # Configuration state management
│   ├── file-utils.ts    # File operations abstraction
│   └── address.ts       # Path management utilities
├── errors/               # Custom error classes
│   ├── user-operation.ts # CLI usage errors
│   ├── configuration.ts # Configuration validation errors
│   └── generic-io.ts    # File system operation errors
└── utils/                # Utility functions
    └── string.ts         # String manipulation helpers
```

### Key Design Patterns
- **Command Pattern**: Each CLI operation is a separate module
- **Repository Pattern**: File operations abstracted through `file-utils.ts`
- **Validation Pattern**: Zod schemas for runtime type checking
- **State Management**: Simple store with `load()`/`save()` lifecycle

### Persistence Architecture
Configuration stored in `~/.config/chiaotu/` with these subdirectories:
- `presets/` - Local proxy configuration files
- `cache/` - Downloaded proxy configurations
- `templates/` - Base Clash configuration templates
- `rules/` - Routing rule definitions (AI, streaming, etc.)
- `configuration.json` - User configuration with upstream URLs
- `results/` - Generated output files

## Core Functionality

### CLI Commands
- `tu add <url|file>` - Add proxy sources (remote URLs or local files)
- `tu generate` - Generate final Clash configuration from all sources

### Proxy Processing Pipeline
1. **Download** - Fetch proxy configurations from upstream URLs
2. **Cache** - Store downloaded configurations locally
3. **Merge** - Combine proxies from multiple sources
4. **Deduplicate** - Remove duplicate proxy entries
5. **Organize** - Group proxies by region (Germany, Taiwan, Hong Kong, etc.)
6. **Filter** - Remove expired proxies (those containing "剩余" or "到期" in names)
7. **Generate** - Create final Clash configuration with routing rules

### Regional Groups
- **Geographic**: Germany, Taiwan, Hong Kong, Japan, Singapore, US, UK, Asia, Other
- **Service**: Manual selection, Microsoft, Apple, AI routing
- **Naming Convention**: Proxies renamed to `name@..first_last` format

## Configuration

### Project Configuration
- **TypeScript**: Strict mode enabled, ES modules, Node.js target
- **Linter/Formatter**: Biome with recommended rules
- **Module System**: ES modules (`"type": "module"`)
- **Target Runtime**: Node.js 20+
- **Build Output**: `./dist` with source maps

### Post-Install Setup
The `postinstall.sh` script:
1. Creates `~/.config/chiaotu/` directory
2. Copies `resources/` directory to config location
3. Sets proper permissions (755) for all files

## Dependencies

### Core Dependencies
- `js-yaml@4.1.1` - YAML parsing/serialization
- `minimist@1.2.8` - Command-line argument parsing
- `zod@4.1.13` - Schema validation and runtime type checking

### Development Dependencies
- `tsx@4.21.0` - TypeScript execution runtime
- `typescript@5.9.3` - Type-safe JavaScript compilation
- `@biomejs/biome@2.3.8` - Code formatting and linting

## Error Handling
Three custom error types:
- `UserOperationError` - CLI usage issues
- `ConfigurationError` - Configuration validation failures
- `GenericIOError` - File system operations with detailed context

## Important Notes

### Development Environment
- Uses ES modules (import/export syntax)
- TypeScript strict mode enforced
- Biome enforces consistent formatting (tabs, double quotes)
- No comprehensive test suite exists - manual testing currently used

### File Operations
- All file paths use Node.js native methods with proper error handling
- Configuration directory is `~/.config/chiaotu/`
- Resources copied during npm install to config directory
- YAML files use both `.yaml` and `.yml` extensions

### Command Structure
- CLI entry point is `src/index.ts`
- Commands are short aliases (`tu` for chiaotu)
- Each command module exports `parse()` and `execute()` functions
- Zero dependencies on external CLI frameworks
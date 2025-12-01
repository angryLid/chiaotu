# CLAUDE.md
**!!important!!**
**The author is working on reporting the Project from Rust to Node.js**
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Rust project named "chiaotu" (version 0.1.0) using the 2024 edition. Currently, it's a minimal Rust starter project with a basic "Hello, world!" application.

## Common Development Commands

### Building and Running
- `cargo build` - Build the project
- `cargo run` - Build and run the application
- `cargo build --release` - Build optimized release version

### Testing and Quality
- `cargo test` - Run all tests
- `cargo test <test_name>` - Run a specific test
- `cargo clippy` - Run linter checks
- `cargo fmt` - Format code according to Rust standards

### Development
- `cargo check` - Quick check without building
- `cargo clean` - Clean build artifacts

## Architecture

Currently a minimal single-module Rust application:
- `src/main.rs` - Entry point with a basic "Hello, world!" function
- No external dependencies defined in Cargo.toml
- Standard Rust project structure following cargo conventions

The project appears to be in early development stage with basic scaffolding.
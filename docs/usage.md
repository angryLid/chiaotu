# Chiaotu CLI - Quick Start

The `tu` command line tool generates proxy configurations by processing cached proxy data.

## Basic Usage

### Generate Proxy Configuration

```bash
tu gen
```

or simply:

```bash
tu
```

This command:
- Loads cached proxy configurations from different sources
- Merges and deduplicates proxy entries
- Creates organized proxy groups by country
- Applies routing rules
- Generates the final proxy configuration file

## What Happens When You Run `tu gen`

1. **Loads Cached Data**: Retrieves previously downloaded proxy configurations
2. **Processes Proxies**: Renames proxies following vendor conventions (format: `name@first..last`)
3. **Merges Data**: Combines proxies from all sources into a single list
4. **Removes Duplicates**: Ensures each proxy name is unique
5. **Creates Groups**: Organizes proxies by country/region
6. **Applies Rules**: Configures routing rules for different domains
7. **Saves Result**: Outputs the final configuration for use

## Example Output

The generated configuration will include:
- A list of all available proxies
- Country-based proxy groups (e.g., China, US, Japan)
- Domain-specific routing rules

## Next Steps

- Run `tu gen` to generate your first proxy configuration
- Add proxy URL files to download additional proxy lists
- Customize rules and groups in the configuration
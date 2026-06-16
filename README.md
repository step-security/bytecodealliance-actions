[![StepSecurity Maintained Action](https://raw.githubusercontent.com/step-security/maintained-actions-assets/main/assets/maintained-action-banner.png)](https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions)

# wasm-tools-setup

A GitHub Action by [StepSecurity](https://stepsecurity.io) that installs [`wasm-tools`](https://github.com/bytecodealliance/wasm-tools) and adds it to the `PATH`, ready to use in subsequent workflow steps.

## Usage

### Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `version` | No | `latest` | `wasm-tools` version to install (e.g. `1.200.0`). Omit to get the latest release. |
| `github_token` | No | `${{ github.token }}` | Token used to query the GitHub API. Supply this to avoid rate limiting on busy runners. |

### Install the latest version

```yaml
steps:
  - uses: step-security/wasm-tools-setup@v1

  - run: wasm-tools --version
```

### Pin to a specific version

```yaml
steps:
  - uses: step-security/wasm-tools-setup@v1
    with:
      version: "1.200.0"

  - run: wasm-tools --version
```

### Use with a GitHub token

```yaml
steps:
  - uses: step-security/wasm-tools-setup@v1
    with:
      github_token: ${{ secrets.GITHUB_TOKEN }}

  - run: wasm-tools --version
```

## License

[MIT](LICENSE)

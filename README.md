[![StepSecurity Maintained Action](https://raw.githubusercontent.com/step-security/maintained-actions-assets/main/assets/maintained-action-banner.png)](https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions)

# step-security/bytecodealliance-actions

A GitHub Action by [StepSecurity](https://stepsecurity.io) that installs [`wasm-tools`](https://github.com/bytecodealliance/wasm-tools) and adds it to the `PATH`, ready to use in subsequent workflow steps.

Secure drop-in replacement for [`bytecodealliance/actions/wasm-tools/setup`](https://github.com/bytecodealliance/actions).

## Install `wasm-tools`

### Inputs

| Name | Required | Default | Description |
|---|---|---|---|
| `version` | No | `latest` | The version of `wasm-tools` to install. |
| `github_token` | No | `${{ github.token }}` | GitHub token for querying/downloading `wasm-tools` releases. Avoids API rate limiting. |

### Examples

#### Setting up the latest version of `wasm-tools`

```yaml
steps:
  - name: Setup `wasm-tools`
    uses: step-security/bytecodealliance-actions/wasm-tools/setup@v1

  - name: Run `wasm-tools version`
    run: wasm-tools --version
```

#### Setting up a specific version of `wasm-tools`

```yaml
steps:
  - name: Setup `wasm-tools`
    uses: step-security/bytecodealliance-actions/wasm-tools/setup@v1
    with:
      version: "1.200.0"

  - name: Run `wasm-tools version`
    run: wasm-tools --version
```

#### Using with a GitHub token

```yaml
steps:
  - name: Setup `wasm-tools`
    uses: step-security/bytecodealliance-actions/wasm-tools/setup@v1
    with:
      github_token: ${{ secrets.GITHUB_TOKEN }}

  - name: Run `wasm-tools version`
    run: wasm-tools --version
```

## License

[MIT](LICENSE)

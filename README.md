<div align="center">
  <sup>Special thanks to:</sup>
  <br>
  <a href="https://www.warp.dev/drawdb/" target="_blank">
    <img alt="Warp sponsorship" width="280" src="https://github.com/user-attachments/assets/c7f141e7-9751-407d-bb0e-d6f2c487b34f">
    <br>
    <b>Next-gen AI-powered intelligent terminal for all platforms</b>
  </a>
</div>

<br/>
<br/>

<div align="center">
    <img width="64" alt="drawDB logo" src="./src/assets/icon-dark.png">
    <h1>drawDB</h1>
</div>

<h3 align="center">Free, simple, and intuitive database schema editor and SQL generator.</h3>

<div align="center" style="margin-bottom:12px;">
    <a href="https://drawdb.app/" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/badge/Start%20building-grey" alt="drawDB"/>
    </a>
    <a href="https://discord.gg/BrjZgNrmR6" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/discord/1196658537208758412.svg?label=Join%20the%20Discord&logo=discord" alt="Discord"/>
    </a>
    <a href="https://x.com/drawDB_" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/badge/Follow%20us%20on%20X-blue?logo=X" alt="Follow us on X"/>
    </a>
</div>

<h3 align="center"><img width="700" style="border-radius:5px;" alt="drawDB screenshot demo" src="drawdb.png"></h3>

DrawDB is a robust and user-friendly database entity relationship diagram (ERD) editor right in your browser. Build diagrams with a few clicks, export and import SQL scripts, generate migrations, customize your editor, and more without creating an account. See the full set of features on [here](https://drawdb.app/).

## ERD Tool public fork

This repository is the public AGPL-3.0 editor foundation for ERD Tool. The fork
started from `drawdb-io/drawdb` commit
`b24ad20b6588b9b99609e8a03b87efa7b28cf245`. ERD Tool keeps its canonical
physical model authoritative and converts it into drawDB's editable diagram
projection; canvas coordinates remain in a separate project layout section.

The ERD Tool action bar opens/saves canonical project JSON, runs ELK-assisted
layout, and displays Snowflake DDL. Primary, unique, and foreign-key constraints
on generated standard Snowflake tables are informational and render as
`NOT ENFORCED`; the fork never adds `RELY` automatically.

See [ERD_TOOL_PATCHES.md](ERD_TOOL_PATCHES.md) for the local patch history and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency provenance.

## Getting Started

### Local Development

```bash
git clone https://github.com/drawdb-io/drawdb
cd drawdb
npm install
npm run dev
```

### Build

```bash
git clone https://github.com/drawdb-io/drawdb
cd drawdb
npm install
npm run build
```

### Docker Build

```bash
docker build -t drawdb .
docker run -p 3000:80 drawdb
```

If you want to enable sharing, set up the [server](https://github.com/drawdb-io/drawdb-server) and environment variables according to `.env.sample`. This is optional unless you need to share files.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Support
- Join discussions: [Discord](https://discord.gg/BrjZgNrmR6)

# Contributing to Windrose Shiplaunch

Thank you for looking. Windrose Shiplaunch is part of [the Windrose Suite](https://www.webpresencecare.com/windrose/). The Suite is young, written with AI help, and I maintain it mostly alone: reviews from human developers are the most useful contribution right now.

## Ways to help

- **Review the code**: security, performance, accessibility, WordPress best practices, multisite edge cases. Open an issue describing what you found, with file and line.
- **Test on your setup**, especially what I do not test daily: Nginx, subdomain networks, mapped domains, large media libraries, many languages, right-to-left languages, object caches.
- **Report bugs**: what you did, what you expected, what happened, WordPress and PHP versions, other active plugins, and anything in `debug.log`.
- **Suggest features**: open an issue first. The Suite adds only what WordPress core lacks, so the first question is often "can core already do this?".

**Security issues are never reported in public issues.** See [SECURITY.md](SECURITY.md).

## Before a pull request

Please open an issue first, so we can agree on the approach. Then:

- Target WordPress 7.2+ and PHP 8.4+.
- Never modify WordPress core or third-party plugins: hooks, filters and public APIs only.
- Follow the naming conventions (prefix `windrose`, `Windrose\<Name>` namespace, `windrose-<name>` text domain).
- All user-facing strings translatable, US English, `sprintf` with numbered placeholders and `/* translators: */` comments.
- No external request without the site owner's opt-in; no telemetry; no custom tables.
- Check capabilities on the target site for every cross-site action; nonces; sanitize input, escape output.

## Checks

Every pull request must pass the repository's CI (`.github/workflows/ci.yml`). [README.md](README.md) says what it runs and how to run the same checks locally.

## AI-assisted contributions

My own work is written with Claude Code and says so in each commit (`Co-Authored-By`). If you use AI tools, please say so in your pull request too. Either way, you are responsible for having read, run and understood what you submit.

## License

By contributing, you agree that your contribution is licensed under GPL-2.0-or-later, like the rest of the project.

# Patched Parcel development server reporter

This package is based on `@parcel/reporter-dev-server@2.9.3`, the version used
by `plasmo@0.90.5`. It keeps the Parcel 2.9 plugin API while backporting the
mitigation for CVE-2025-56648 / GHSA-qm9p-f9j5-w83w.

The vulnerable reporter returned `Access-Control-Allow-Origin: *` and related
CORS headers from its local development server. This copy removes those
headers, preventing arbitrary websites from reading development-server
responses. The package version is `2.16.4-algovault` so dependency auditing
can distinguish the patched copy from the vulnerable upstream release.

The compiled reporter and templates were copied from the official npm tarball.
`LICENSE` contains the upstream MIT license. Replace this package with an
official Plasmo-compatible release once Plasmo upgrades its Parcel integration.

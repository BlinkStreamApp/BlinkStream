"""Read-only advisory lookup: send public registry package names/versions, not code."""
import json
from pathlib import Path
import tomllib
from urllib.request import Request, urlopen

packages = [package for package in tomllib.loads(Path("src-tauri/Cargo.lock").read_text(encoding="utf8"))["package"]
            if package.get("source", "").startswith("registry+")]
findings = []
maintenance = []
for offset in range(0, len(packages), 64):
    batch = packages[offset:offset + 64]
    payload = {"queries": [{"package": {"name": package["name"], "ecosystem": "crates.io"}, "version": package["version"]} for package in batch]}
    request = Request("https://api.osv.dev/v1/querybatch", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        results = json.load(response)["results"]
    for package, result in zip(batch, results, strict=True):
        for vulnerability in result.get("vulns", []):
            with urlopen("https://api.osv.dev/v1/vulns/" + vulnerability["id"], timeout=30) as response:
                details = json.load(response)
            informational = next((item.get("database_specific", {}).get("informational") for item in details.get("affected", []) if item.get("package", {}).get("name") == package["name"]), None)
            entry = {"package": package["name"], "version": package["version"], "advisory": vulnerability["id"], "summary": details.get("summary"), "informational": informational}
            (maintenance if informational == "unmaintained" else findings).append(entry)
print(json.dumps({"registry_packages_checked": len(packages), "local_vendor_excluded": True, "vulnerabilities": findings, "unmaintained_dependencies": maintenance}, indent=2))
raise SystemExit(1 if findings else 0)
